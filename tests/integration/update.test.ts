import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as updateRoute from "@/app/api/update/route";
import * as checkRoute from "@/app/api/update/check/route";
import * as downloadRoute from "@/app/api/update/download/route";
import * as installRoute from "@/app/api/update/install/route";
import { setTestCtxFactory } from "@/server/http/api";
import { cleanupUpdates, compareVersions, getUpdateInfo, manifestSchema, setTestAppVersion, setTestSpawn } from "@/server/update";
import { cookieForUser, ensureUsers } from "../apiHelpers";
import { createEnv, type TestEnv } from "../helpers";

// GitHub yerine yerel deneme sunucusu: latest.json + Optiva-Setup.exe
const SETUP = crypto.randomBytes(300_000);
const SHA = crypto.createHash("sha256").update(SETUP).digest("hex");
const MACZIP = crypto.randomBytes(120_000);
const MACSHA = crypto.createHash("sha256").update(MACZIP).digest("hex");
let manifest: Record<string, unknown>;
let setupBody: Buffer = SETUP;
let requests: string[] = [];
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push(req.url ?? "");
    if (req.url === "/latest.json") res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(manifest));
    else if (req.url === "/Optiva-Setup.exe") res.writeHead(200, { "content-length": setupBody.length }).end(setupBody);
    else if (req.url === "/Optiva-Mac.zip") res.writeHead(200, { "content-length": MACZIP.length }).end(MACZIP);
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  setTestCtxFactory(undefined);
});

let env: TestEnv;
let tmp: string;
const saved = { ...process.env };

beforeEach(() => {
  env = createEnv("2026-10-10T09:00:00.000Z");
  setTestCtxFactory(() => env.ctx);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mk-update-"));
  process.env.MARKET_KASA_UPDATE_BASE = base;
  process.env.MARKET_UPDATE_DIR = path.join(tmp, "updates");
  process.env.BACKUP_DIR = path.join(tmp, "backups");
  setTestAppVersion({ version: "1.1.40", channel: "windows", commit: null, builtAt: null });
  manifest = { version: "1.1.42", sha256: SHA, size: SETUP.length, notes: "Yeni özellikler", mac: { sha256: MACSHA, size: MACZIP.length } };
  setupBody = SETUP;
  requests = [];
});
afterEach(() => {
  setTestAppVersion(null);
  setTestSpawn(null);
  for (const k of ["MARKET_KASA_UPDATE_BASE", "MARKET_UPDATE_DIR", "BACKUP_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

function req(p: string, cookie: string, body?: unknown): Request {
  const headers = new Headers({ host: "localhost:3000", cookie });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${p}`, { method: body !== undefined ? "POST" : "GET", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ownerCookie = () => cookieForUser(ensureUsers(env).owner);
const setupFile = () => path.join(tmp, "updates", "Optiva-Setup.exe");

describe("sürüm karşılaştırma ve sürüm bilgisi", () => {
  it("sayı sayı karşılaştırır (1.1.10 > 1.1.9)", () => {
    expect(compareVersions("1.1.10", "1.1.9")).toBe(1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });
  it("latest.json biçimi denetlenir (bozuk parmak izi / sürüm reddedilir)", () => {
    expect(manifestSchema.safeParse({ version: "1.1.42", sha256: SHA, size: 10 }).success).toBe(true);
    expect(manifestSchema.safeParse({ version: "1.1", sha256: SHA, size: 10 }).success).toBe(false);
    expect(manifestSchema.safeParse({ version: "1.1.42", sha256: "abc", size: 10 }).success).toBe(false);
  });
  it("proje klasöründen çalışırken (Mac) güncelleme denetlenmez", async () => {
    delete process.env.MARKET_KASA_UPDATE_BASE;
    setTestAppVersion({ version: "1.1.0", channel: "dev", commit: null, builtAt: null });
    const r = await json(await checkRoute.POST(req("/api/update/check", await ownerCookie(), {})));
    expect(r.update.enabled).toBe(false);
    expect(r.update.available).toBe(false);
    expect(requests).toEqual([]);
  });
});

describe("güncelleme denetimi", () => {
  it("yeni sürüm varsa görünür; kasiyer göremez", async () => {
    const cookie = await ownerCookie();
    const before = await json(await updateRoute.GET(req("/api/update", cookie)));
    expect(before.update).toMatchObject({ current: "1.1.40", available: false, checkedAt: null });

    const r = await json(await checkRoute.POST(req("/api/update/check", cookie, {})));
    expect(r.update).toMatchObject({ current: "1.1.40", available: true, canDownload: true, error: null });
    expect(r.update.latest).toMatchObject({ version: "1.1.42", notes: "Yeni özellikler" });

    const cashier = await cookieForUser(ensureUsers(env).cashier);
    expect((await updateRoute.GET(req("/api/update", cashier))).status).toBe(403);
    expect((await checkRoute.POST(req("/api/update/check", cashier, {}))).status).toBe(403);
    expect((await downloadRoute.POST(req("/api/update/download", cashier, {}))).status).toBe(403);
  });

  it("aynı ya da eski sürüm → güncel; indirme reddedilir", async () => {
    manifest.version = "1.1.40";
    const cookie = await ownerCookie();
    const r = await json(await checkRoute.POST(req("/api/update/check", cookie, {})));
    expect(r.update.available).toBe(false);
    const d = await downloadRoute.POST(req("/api/update/download", cookie, {}));
    expect(d.status).toBe(409);
    expect((await json(d)).error.code).toBe("NO_UPDATE");
  });

  it("sunucuya ulaşılamazsa anlaşılır hata, program çalışmaya devam eder", async () => {
    process.env.MARKET_KASA_UPDATE_BASE = "http://127.0.0.1:9"; // kapalı port
    const r = await json(await checkRoute.POST(req("/api/update/check", await ownerCookie(), {})));
    expect(r.update.available).toBe(false);
    expect(r.update.error).toMatch(/İnternete bağlanılamadı|alınamadı/);
  });

  it("bozuk latest.json kabul edilmez", async () => {
    manifest = { version: "1.1.42", sha256: "bozuk", size: 1 };
    const r = await json(await checkRoute.POST(req("/api/update/check", await ownerCookie(), {})));
    expect(r.update.available).toBe(false);
    expect(r.update.error).toMatch(/okunamadı/);
  });
});

describe("güncellemeyi indirme", () => {
  it("önce yedek alır, dosyayı indirip parmak iziyle doğrular, işlem geçmişine yazar", async () => {
    const cookie = await ownerCookie();
    await checkRoute.POST(req("/api/update/check", cookie, {}));
    const r = await downloadRoute.POST(req("/api/update/download", cookie, {}));
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.version).toBe("1.1.42");
    expect(body.backup).toMatch(/^store-\d{8}-\d{4}\.db$/);
    expect(fs.existsSync(path.join(tmp, "backups", body.backup))).toBe(true);
    expect(fs.readFileSync(setupFile()).equals(SETUP)).toBe(true);
    expect(fs.existsSync(`${setupFile()}.part`)).toBe(false);
    expect(body.update.downloadedVersion).toBe("1.1.42");
    const log = env.db.prepare("SELECT action, summary FROM audit_log WHERE action = 'update.download'").all() as { summary: string }[];
    expect(log).toHaveLength(1);
    expect(log[0]!.summary).toContain("1.1.40 → 1.1.42");
  });

  it("dosya bozuk/eksik inerse silinir ve kurulmaz", async () => {
    const cookie = await ownerCookie();
    await checkRoute.POST(req("/api/update/check", cookie, {}));
    setupBody = Buffer.concat([SETUP.subarray(0, SETUP.length - 1), Buffer.from([SETUP[SETUP.length - 1]! ^ 0xff])]); // son bayt değişti
    const r = await downloadRoute.POST(req("/api/update/download", cookie, {}));
    expect(r.status).toBe(502);
    expect((await json(r)).error.code).toBe("UPDATE_CORRUPT");
    expect(fs.existsSync(setupFile())).toBe(false);
    expect(fs.existsSync(`${setupFile()}.part`)).toBe(false);

    setupBody = SETUP.subarray(0, 1000); // eksik
    const r2 = await downloadRoute.POST(req("/api/update/download", cookie, {}));
    expect(r2.status).toBe(502);
    expect(fs.existsSync(setupFile())).toBe(false);
  });

  it("Windows başlatıcısı yoksa (indirme klasörü bilinmiyor) indirme yapılmaz", async () => {
    delete process.env.MARKET_UPDATE_DIR;
    const cookie = await ownerCookie();
    const r = await json(await checkRoute.POST(req("/api/update/check", cookie, {})));
    expect(r.update).toMatchObject({ available: true, canDownload: false });
    const d = await downloadRoute.POST(req("/api/update/download", cookie, {}));
    expect(d.status).toBe(409);
    expect((await json(d)).error.code).toBe("UPDATE_UNSUPPORTED");
  });

  it("açılışta önceki güncellemeden kalan dosya temizlenir", async () => {
    fs.mkdirSync(path.dirname(setupFile()), { recursive: true });
    fs.writeFileSync(setupFile(), "eski");
    fs.writeFileSync(`${setupFile()}.part`, "yarım");
    cleanupUpdates();
    expect(fs.existsSync(setupFile())).toBe(false);
    expect(fs.existsSync(`${setupFile()}.part`)).toBe(false);
    expect(getUpdateInfo().current).toBe("1.1.40");
  });
});

describe("Mac kurulum klasörü", () => {
  const macZip = () => path.join(tmp, "updates", "Optiva-Mac.zip");
  let spawned: { script: string; args: string[] }[];
  beforeEach(() => {
    setTestAppVersion({ version: "1.1.40", channel: "mac", commit: null, builtAt: null });
    spawned = [];
    setTestSpawn((script, args) => void spawned.push({ script, args }));
  });

  it("Mac paketini indirir (Windows dosyasını değil), doğrular ve güncelleme betiğini başlatır", async () => {
    const cookie = await ownerCookie();
    const c = await json(await checkRoute.POST(req("/api/update/check", cookie, {})));
    expect(c.update).toMatchObject({ channel: "mac", available: true, canDownload: true });

    // indirmeden kurulum olmaz
    const early = await installRoute.POST(req("/api/update/install", cookie, {}));
    expect(early.status).toBe(409);
    expect((await json(early)).error.code).toBe("NOT_DOWNLOADED");

    const d = await downloadRoute.POST(req("/api/update/download", cookie, {}));
    expect(d.status).toBe(200);
    expect(fs.readFileSync(macZip()).equals(MACZIP)).toBe(true);
    expect(fs.existsSync(setupFile())).toBe(false);
    expect(requests).toContain("/Optiva-Mac.zip");
    expect(requests).not.toContain("/Optiva-Setup.exe");

    const r = await installRoute.POST(req("/api/update/install", cookie, {}));
    expect(r.status).toBe(200);
    expect((await json(r)).version).toBe("1.1.42");
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.script).toMatch(/scripts[\\/]mac-update\.sh$/);
    expect(spawned[0]!.args).toEqual([macZip(), "1.1.42"]);
    const log = env.db.prepare("SELECT summary FROM audit_log WHERE action = 'update.install'").all() as { summary: string }[];
    expect(log[0]!.summary).toContain("1.1.40 → 1.1.42");

    const cashier = await cookieForUser(ensureUsers(env).cashier);
    expect((await installRoute.POST(req("/api/update/install", cashier, {}))).status).toBe(403);
  });

  it("yayında Mac paketi yoksa indirme yapılmaz", async () => {
    manifest.mac = null;
    const cookie = await ownerCookie();
    const c = await json(await checkRoute.POST(req("/api/update/check", cookie, {})));
    expect(c.update).toMatchObject({ available: true, canDownload: false });
    const d = await downloadRoute.POST(req("/api/update/download", cookie, {}));
    expect(d.status).toBe(409);
    expect((await json(d)).error.code).toBe("UPDATE_UNSUPPORTED");
  });

  it("Mac paketi bozuk inerse kurulmaz", async () => {
    manifest.mac = { sha256: "0".repeat(64), size: MACZIP.length };
    const cookie = await ownerCookie();
    await checkRoute.POST(req("/api/update/check", cookie, {}));
    expect((await downloadRoute.POST(req("/api/update/download", cookie, {}))).status).toBe(502);
    expect(fs.existsSync(macZip())).toBe(false);
  });

  it("Windows kurulumunda bu uç kullanılmaz (orada pencere kurar)", async () => {
    setTestAppVersion({ version: "1.1.40", channel: "windows", commit: null, builtAt: null });
    const r = await installRoute.POST(req("/api/update/install", await ownerCookie(), {}));
    expect(r.status).toBe(409);
    expect((await json(r)).error.code).toBe("UPDATE_UNSUPPORTED");
    expect(spawned).toHaveLength(0);
  });

  it("son güncelleme sonucunu gösterir (başarısızsa nedeni)", async () => {
    fs.mkdirSync(path.join(tmp, "updates"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "updates", "last-result.json"),
      JSON.stringify({ ok: false, version: "1.1.42", error: "Yeni sürüm derlenemedi.", at: "2026-10-10T10:00:00.000Z" }),
    );
    const r = await json(await updateRoute.GET(req("/api/update", await ownerCookie())));
    expect(r.update.lastInstall).toMatchObject({ ok: false, error: "Yeni sürüm derlenemedi." });
  });

  it("geliştirme kopyasında (version.json yok) güncelleme kapalı", async () => {
    delete process.env.MARKET_KASA_UPDATE_BASE;
    setTestAppVersion({ version: "1.1.0", channel: "dev", commit: null, builtAt: null });
    const r = await json(await updateRoute.GET(req("/api/update", await ownerCookie())));
    expect(r.update).toMatchObject({ enabled: false, canDownload: false, lastInstall: null });
  });
});
