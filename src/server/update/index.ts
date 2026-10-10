/**
 * Program güncellemeleri (Windows kurulumu).
 *
 * - Her Windows derlemesi programın içine `version.json` koyar (sürüm numarası GitHub'daki derleme sırasıyla artar).
 * - GitHub'daki en son sürümün yanında `latest.json` durur: sürüm, kurulum dosyasının boyutu ve SHA-256 parmak izi.
 * - Program açılışta ve 6 saatte bir bu bilgiye bakar; yeni sürüm varsa yöneticiye gösterir.
 * - "Güncelle": önce yedek alınır, kurulum dosyası indirilir ve parmak izi doğrulanır. Kurulumu Market Kasa
 *   penceresi (Windows başlatıcısı) başlatır: pencere kapanır, sessiz kurulum yapılır, program yeniden açılır.
 *
 * İndirme adresi sabittir (GitHub); `latest.json` içinden adres alınmaz. Testler için MARKET_KASA_UPDATE_BASE
 * ortam değişkeni başka bir adres verebilir (kurulum dosyaları bunu ayarlamaz).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "../context";
import { AppError } from "../errors";
import { audit } from "../services/audit";
import { createBackup } from "../services/backup";
import { z } from "../validation/zod";

const DEFAULT_BASE = "https://github.com/kivancsh/market-pos/releases/latest/download";
export const SETUP_FILE = "Market-Kasa-Setup.exe";
const CHECK_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

// ------------------------------------------------------------------ sürüm
export interface AppVersion {
  version: string;
  /** "windows": kurulum paketi (güncellenebilir) · "dev": proje klasöründen çalışan (Mac / geliştirme). */
  channel: "windows" | "dev";
  commit: string | null;
  builtAt: string | null;
}

const versionFileSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  commit: z.string().nullish(),
  builtAt: z.string().nullish(),
});

const g = globalThis as unknown as {
  __mkVersion?: AppVersion;
  __mkTestVersion?: AppVersion | null;
  __mkUpdate?: UpdateState;
  __mkDownload?: Promise<DownloadResult> | null;
};

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Çalışan programın sürümü. Kurulum paketinde version.json'dan, proje klasöründe package.json'dan. */
export function getAppVersion(): AppVersion {
  if (g.__mkTestVersion) return g.__mkTestVersion;
  if (g.__mkVersion) return g.__mkVersion;
  const cwd = process.cwd();
  const packaged = versionFileSchema.safeParse(readJson(path.join(/*turbopackIgnore: true*/ cwd, "version.json")));
  if (packaged.success) {
    g.__mkVersion = { version: packaged.data.version, channel: "windows", commit: packaged.data.commit ?? null, builtAt: packaged.data.builtAt ?? null };
  } else {
    const pkg = readJson(path.join(/*turbopackIgnore: true*/ cwd, "package.json")) as { version?: string } | null;
    g.__mkVersion = { version: pkg?.version ?? "0.0.0", channel: "dev", commit: null, builtAt: null };
  }
  return g.__mkVersion;
}

/** Testler: çalışan sürümü taklit et (null → gerçek). */
export function setTestAppVersion(v: AppVersion | null): void {
  g.__mkTestVersion = v;
  g.__mkUpdate = undefined;
  g.__mkDownload = null;
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
export const manifestSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive().max(1024 * 1024 * 1024),
  publishedAt: z.string().max(40).nullish(),
  notes: z.string().max(2000).nullish(),
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

/** Kurulum paketinde (ya da test adresi verilmişse) güncelleme denetlenir; proje klasöründe denetlenmez. */
export function updatesEnabled(): boolean {
  return getAppVersion().channel === "windows" || Boolean(process.env.MARKET_KASA_UPDATE_BASE);
}

/** İndirilen kurulum dosyasının klasörü (Windows başlatıcısı verir: %LOCALAPPDATA%\Market Kasa\updates). */
function updatesDir(): string | null {
  return process.env.MARKET_UPDATE_DIR || null;
}

export interface UpdateInfo {
  current: string;
  channel: AppVersion["channel"];
  enabled: boolean;
  checkedAt: string | null;
  latest: UpdateManifest | null;
  available: boolean;
  error: string | null;
  /** Bu bilgisayarda indirilip kurulabilir mi (Windows kurulumu). */
  canDownload: boolean;
  downloadedVersion: string | null;
}

export function getUpdateInfo(): UpdateInfo {
  const v = getAppVersion();
  const s = state();
  const enabled = updatesEnabled();
  const available = enabled && s.latest !== null && compareVersions(s.latest.version, v.version) > 0;
  return {
    current: v.version,
    channel: v.channel,
    enabled,
    checkedAt: s.checkedAt,
    latest: s.latest,
    available,
    error: s.error,
    canDownload: enabled && updatesDir() !== null,
    downloadedVersion: s.downloadedVersion,
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
 * Önce yedek alır, sonra kurulum dosyasını indirir; boyut ve SHA-256 tutmazsa dosyayı siler.
 * Doğrulanmış dosya `updates/Market-Kasa-Setup.exe` olarak bırakılır (başlatıcı onu çalıştırır).
 */
export async function downloadUpdate(ctx: Ctx): Promise<DownloadResult> {
  if (g.__mkDownload) return g.__mkDownload; // çift tıklama: aynı indirme
  const run = (async () => {
    const info = getUpdateInfo();
    const dir = updatesDir();
    if (!info.enabled || !dir) throw new AppError("UPDATE_UNSUPPORTED", "Bu bilgisayarda program buradan güncellenemez.", 409);
    if (!info.available || !info.latest) throw new AppError("NO_UPDATE", "Yeni sürüm yok. Önce 'Güncellemeleri denetle'ye basın.", 409);
    const latest = info.latest;

    const backupFile = await createBackup(ctx.db, ctx.now());
    const backup = path.basename(backupFile);

    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, SETUP_FILE);
    const part = `${target}.part`;
    fs.rmSync(target, { force: true });
    fs.rmSync(part, { force: true });
    try {
      await fetchToFile(`${updateBase()}/${SETUP_FILE}`, part, latest);
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

async function fetchToFile(url: string, file: string, expect: UpdateManifest): Promise<void> {
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

/** Açılışta: önceki güncellemeden kalan kurulum dosyasını sil (kurulmuş ya da yarım kalmış). */
export function cleanupUpdates(): void {
  const dir = updatesDir();
  if (!dir) return;
  for (const f of [SETUP_FILE, `${SETUP_FILE}.part`]) {
    try {
      fs.rmSync(path.join(dir, f), { force: true });
    } catch {
      // kilitliyse bir sonraki açılışta
    }
  }
}
