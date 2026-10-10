/**
 * Program güncellemeleri (Windows kurulumu ve Mac kurulum klasörü).
 *
 * - Her yayın programın içine `version.json` koyar (sürüm numarası GitHub'daki derleme sırasıyla artar).
 * - GitHub'daki en son sürümün yanında `latest.json` durur: sürüm; Windows kurulum dosyasının ve Mac paketinin
 *   boyutu ve SHA-256 parmak izi.
 * - Program açılışta ve 6 saatte bir bu bilgiye bakar; yeni sürüm varsa yöneticiye gösterir.
 * - "Güncelle": önce yedek alınır, dosya indirilir ve parmak izi doğrulanır. Sonra:
 *   - Windows: Market Kasa penceresi (başlatıcı) sessiz kurulumu başlatıp kapanır; kurulum programı yeniden açar.
 *   - Mac: scripts/mac-update.sh arka planda eski sürümü kenara alır, yeni dosyaları koyar, derler ve başlatır;
 *     bir adım başarısız olursa eski sürüme geri döner. Sonucu updates/last-result.json'a yazar.
 * - Proje klasörü bir geliştirme kopyasıysa (git, version.json yok) güncelleme denetlenmez.
 *
 * İndirme adresi sabittir (GitHub); `latest.json` içinden adres alınmaz. Testler için MARKET_KASA_UPDATE_BASE
 * ortam değişkeni başka bir adres verebilir (kurulum dosyaları bunu ayarlamaz).
 *
 * Not: Bu dosyada değişken yolla yapılan her dosya işleminde `/*turbopackIgnore: true*\/` işareti şarttır; yoksa
 * Next.js bütün proje klasörünü Windows paketine ekler (derleme uyarısı "Dynamic filesystem access…").
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "../context";
import { AppError } from "../errors";
import { audit } from "../services/audit";
import { createBackup } from "../services/backup";
import { z } from "../validation/zod";
import pkg from "../../../package.json";

const DEFAULT_BASE = "https://github.com/kivancsh/market-pos/releases/latest/download";
export const SETUP_FILE = "Market-Kasa-Setup.exe";
export const MAC_FILE = "Market-Kasa-Mac.zip";
const CHECK_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

// ------------------------------------------------------------------ sürüm
export type UpdateChannel = "windows" | "mac" | "dev";

export interface AppVersion {
  version: string;
  /** "windows": Windows kurulumu · "mac": Mac kurulum klasörü · "dev": geliştirme kopyası (güncelleme denetlenmez). */
  channel: UpdateChannel;
  commit: string | null;
  builtAt: string | null;
}

const versionFileSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  channel: z.enum(["windows", "mac"]).nullish(),
  commit: z.string().nullish(),
  builtAt: z.string().nullish(),
});

const g = globalThis as unknown as {
  __mkVersion?: AppVersion;
  __mkTestVersion?: AppVersion | null;
  __mkUpdate?: UpdateState;
  __mkDownload?: Promise<DownloadResult> | null;
  __mkSpawn?: ((script: string, args: string[]) => void) | null;
};

function parseJson(text: string | undefined): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * Çalışan programın sürümü. version.json'u sunucuyu başlatan betik okuyup MARKET_KASA_VERSION_INFO ile verir
 * (Windows: windows/kasa-server.js, Mac: scripts/service.sh). Yoksa geliştirme kopyasıdır: package.json'daki sürüm.
 */
export function getAppVersion(): AppVersion {
  if (g.__mkTestVersion) return g.__mkTestVersion;
  if (g.__mkVersion) return g.__mkVersion;
  const packaged = versionFileSchema.safeParse(parseJson(process.env.MARKET_KASA_VERSION_INFO));
  g.__mkVersion = packaged.success
    ? {
        version: packaged.data.version,
        channel: packaged.data.channel ?? "windows",
        commit: packaged.data.commit ?? null,
        builtAt: packaged.data.builtAt ?? null,
      }
    : { version: pkg.version, channel: "dev", commit: null, builtAt: null };
  return g.__mkVersion;
}

/** Testler: çalışan sürümü taklit et (null → gerçek). */
export function setTestAppVersion(v: AppVersion | null): void {
  g.__mkTestVersion = v;
  g.__mkUpdate = undefined;
  g.__mkDownload = null;
}

/** Testler: Mac güncelleme betiğini çalıştırmak yerine çağrıyı yakala (null → gerçek). */
export function setTestSpawn(f: ((script: string, args: string[]) => void) | null): void {
  g.__mkSpawn = f;
}

/** "1.2.10" > "1.2.9" (sayı sayı karşılaştırır). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// ------------------------------------------------------------------ en son sürüm bilgisi
const fileInfo = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive().max(1024 * 1024 * 1024),
});

/** latest.json. Üst düzeydeki sha256/size Windows kurulum dosyasınındır (eski sürümler bunu okur); `mac` Mac paketinin. */
export const manifestSchema = fileInfo.extend({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  publishedAt: z.string().max(40).nullish(),
  notes: z.string().max(2000).nullish(),
  mac: fileInfo.nullish(),
});
export type UpdateManifest = z.infer<typeof manifestSchema>;

interface UpdateState {
  checkedAt: string | null;
  latest: UpdateManifest | null;
  error: string | null;
  downloadedVersion: string | null;
}

function state(): UpdateState {
  return (g.__mkUpdate ??= { checkedAt: null, latest: null, error: null, downloadedVersion: null });
}

function updateBase(): string {
  return (process.env.MARKET_KASA_UPDATE_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

/** Kurulumda (ya da test adresi verilmişse) güncelleme denetlenir; geliştirme kopyasında denetlenmez. */
export function updatesEnabled(): boolean {
  return getAppVersion().channel !== "dev" || Boolean(process.env.MARKET_KASA_UPDATE_BASE);
}

/** İndirilen dosyanın klasörü (Windows başlatıcısı / Mac service.sh verir). */
function updatesDir(): string | null {
  const dir = process.env.MARKET_UPDATE_DIR;
  return dir ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), dir) : null;
}

/** Bu kanalda indirilecek dosya ve beklenen boyut/parmak izi. */
function artifactFor(channel: UpdateChannel, latest: UpdateManifest): { file: string; sha256: string; size: number } | null {
  if (channel === "mac") return latest.mac ? { file: MAC_FILE, ...latest.mac } : null;
  return { file: SETUP_FILE, sha256: latest.sha256, size: latest.size };
}

const lastResultSchema = z.object({
  ok: z.boolean(),
  version: z.string().max(40).nullish(),
  error: z.string().max(500).nullish(),
  at: z.string().max(40),
});
export type LastInstall = z.infer<typeof lastResultSchema>;

/** Mac: son güncelleme denemesinin sonucu (scripts/mac-update.sh yazar). */
function readLastInstall(dir: string | null): LastInstall | null {
  if (!dir) return null;
  try {
    const r = lastResultSchema.safeParse(JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, "last-result.json"), "utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export interface UpdateInfo {
  current: string;
  channel: UpdateChannel;
  enabled: boolean;
  checkedAt: string | null;
  latest: UpdateManifest | null;
  available: boolean;
  error: string | null;
  /** Bu bilgisayarda indirilip kurulabilir mi. */
  canDownload: boolean;
  downloadedVersion: string | null;
  /** Mac: son güncelleme denemesinin sonucu. */
  lastInstall: LastInstall | null;
}

export function getUpdateInfo(): UpdateInfo {
  const v = getAppVersion();
  const s = state();
  const enabled = updatesEnabled();
  const dir = updatesDir();
  const available = enabled && s.latest !== null && compareVersions(s.latest.version, v.version) > 0;
  return {
    current: v.version,
    channel: v.channel,
    enabled,
    checkedAt: s.checkedAt,
    latest: s.latest,
    available,
    error: s.error,
    canDownload: enabled && dir !== null && (s.latest === null || artifactFor(v.channel, s.latest) !== null),
    downloadedVersion: s.downloadedVersion,
    lastInstall: v.channel === "mac" ? readLastInstall(dir) : null,
  };
}

/** GitHub'daki en son sürüm bilgisini okur. Hata fırlatmaz; sonucu durum bilgisine yazar. */
export async function checkForUpdate(now: Date = new Date()): Promise<UpdateInfo> {
  if (!updatesEnabled()) return getUpdateInfo();
  const s = state();
  try {
    const res = await fetch(`${updateBase()}/latest.json`, {
      cache: "no-store",
      redirect: "follow",
      headers: { "user-agent": `MarketKasa/${getAppVersion().version}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = manifestSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("sürüm bilgisi okunamadı");
    s.latest = parsed.data;
    s.error = null;
  } catch (e) {
    s.error = friendlyNetError(e);
  }
  s.checkedAt = now.toISOString();
  return getUpdateInfo();
}

function friendlyNetError(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string } };
  if (err.name === "TimeoutError" || err.name === "AbortError") return "Güncelleme sunucusu yanıt vermedi.";
  const code = err.cause?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT")
    return "İnternete bağlanılamadı.";
  return `Güncelleme bilgisi alınamadı (${err.message ?? "bilinmeyen hata"}).`;
}

// ------------------------------------------------------------------ indirme
export interface DownloadResult {
  version: string;
  backup: string;
}

/**
 * Önce yedek alır, sonra bu kanalın dosyasını indirir; boyut ve SHA-256 tutmazsa dosyayı siler.
 * Doğrulanmış dosya updates klasörüne bırakılır (Windows: Market-Kasa-Setup.exe, Mac: Market-Kasa-Mac.zip).
 */
export async function downloadUpdate(ctx: Ctx): Promise<DownloadResult> {
  if (g.__mkDownload) return g.__mkDownload; // çift tıklama: aynı indirme
  const run = (async () => {
    const info = getUpdateInfo();
    const dir = updatesDir();
    if (!info.enabled || !dir) throw new AppError("UPDATE_UNSUPPORTED", "Bu bilgisayarda program buradan güncellenemez.", 409);
    if (!info.available || !info.latest) throw new AppError("NO_UPDATE", "Yeni sürüm yok. Önce 'Güncellemeleri denetle'ye basın.", 409);
    const latest = info.latest;
    const art = artifactFor(info.channel, latest);
    if (!art) throw new AppError("UPDATE_UNSUPPORTED", "Bu sürümün bu bilgisayar için paketi yok.", 409);

    const backupFile = await createBackup(ctx.db, ctx.now());
    const backup = path.basename(backupFile);

    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(/*turbopackIgnore: true*/ dir, art.file);
    const part = `${target}.part`;
    fs.rmSync(target, { force: true });
    fs.rmSync(part, { force: true });
    try {
      await fetchToFile(`${updateBase()}/${art.file}`, part, art);
    } catch (e) {
      fs.rmSync(part, { force: true });
      if (e instanceof AppError) throw e;
      throw new AppError("UPDATE_DOWNLOAD_FAILED", `Güncelleme indirilemedi: ${friendlyNetError(e)} Tekrar deneyin.`, 502);
    }
    fs.renameSync(part, target);
    state().downloadedVersion = latest.version;
    ctx.db
      .transaction(() =>
        audit(ctx, "update.download", `Güncelleme indirildi: ${info.current} → ${latest.version} (önce yedek alındı: ${backup})`),
      )
      .immediate();
    return { version: latest.version, backup };
  })();
  g.__mkDownload = run;
  try {
    return await run;
  } finally {
    g.__mkDownload = null;
  }
}

async function fetchToFile(url: string, file: string, expect: { sha256: string; size: number }): Promise<void> {
  const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "w");
  let size = 0;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > expect.size) break;
      hash.update(chunk);
      fs.writeSync(fd, chunk);
    }
  } finally {
    fs.closeSync(fd);
  }
  if (size !== expect.size || hash.digest("hex") !== expect.sha256) {
    throw new AppError("UPDATE_CORRUPT", "İndirilen dosya doğrulanamadı (eksik ya da bozuk indi). Tekrar deneyin.", 502);
  }
}

// ------------------------------------------------------------------ Mac: kurulum
/**
 * Mac: indirilen paketi scripts/mac-update.sh ile kurar. Betik arka planda çalışır (sunucuyu durdurup yeniden
 * başlatacağı için bu süreçten bağımsız); bitince sonucu updates/last-result.json'a yazar.
 */
export function installMacUpdate(ctx: Ctx): { version: string } {
  const info = getUpdateInfo();
  const dir = updatesDir();
  if (info.channel !== "mac" || !dir) throw new AppError("UPDATE_UNSUPPORTED", "Bu bilgisayarda program buradan güncellenemez.", 409);
  const version = state().downloadedVersion;
  const zip = path.join(/*turbopackIgnore: true*/ dir, MAC_FILE);
  if (!version || !fs.existsSync(zip)) throw new AppError("NOT_DOWNLOADED", "Önce güncellemeyi indirin.", 409);

  const script = path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "mac-update.sh");
  const args = [zip, version];
  if (g.__mkSpawn) g.__mkSpawn(script, args);
  else {
    const child = spawn("/bin/bash", [script, ...args], {
      cwd: /*turbopackIgnore: true*/ process.cwd(),
      detached: true,
      stdio: "ignore",
      env: { ...process.env, MARKET_KASA_UPDATER: "1" },
    });
    child.unref();
  }
  ctx.db.transaction(() => audit(ctx, "update.install", `Güncelleme kuruluyor: ${info.current} → ${version}`)).immediate();
  return { version };
}

/** Açılışta: önceki güncellemeden kalan dosyaları sil (kurulmuş ya da yarım kalmış). */
export function cleanupUpdates(): void {
  const dir = updatesDir();
  if (!dir) return;
  for (const f of [SETUP_FILE, `${SETUP_FILE}.part`, MAC_FILE, `${MAC_FILE}.part`]) {
    try {
      fs.rmSync(path.join(/*turbopackIgnore: true*/ dir, f), { force: true });
    } catch {
      // kilitliyse bir sonraki açılışta
    }
  }
}
