import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as forgotStartRoute from "@/app/api/auth/forgot/start/route";
import * as svcConfirmRoute from "@/app/api/settings/mail/service/confirm/route";
import * as svcStartRoute from "@/app/api/settings/mail/service/start/route";
import { resetLimiterForTests } from "@/server/auth/loginLimiter";
import { readMailConfig, readServiceCreds } from "@/server/db/repositories/mailConfig";
import { getUserById } from "@/server/db/repositories/users";
import { setTestCtxFactory } from "@/server/http/api";
import { decryptSecret, isMailConfigured, sendMail, usesMailService } from "@/server/mail";
import { sendDailyReport } from "@/server/services/dailyReport";
import { completeSale } from "@/server/services/sales";
import { handle, type Deps, type Env, type KV, type OutgoingEmail } from "../../mail-service/src/worker";
import { cookieForUser, ensureUsers } from "../apiHelpers";
import { createEnv, seedSample, uuid, type TestEnv } from "../helpers";

/**
 * Uygulama ↔ merkezi e-posta servisi uçtan uca: servis kodu (mail-service/src/worker.ts) yerel bir HTTP sunucusunda
 * çalışır, uygulama MARKET_KASA_MAIL_SERVICE ile ona bağlanır. Gerçek e-posta gönderilmez (sendEmail yakalanır).
 */
class MemKV implements KV {
  m = new Map<string, string>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.m.set(k, v);
  }
  async delete(k: string) {
    this.m.delete(k);
  }
}

let server: http.Server;
let svcEnv: Env;
let outbox: OutgoingEmail[];
let tokenN = 0;
const deps: Deps = {
  sendEmail: async (_e, m) => void outbox.push(m),
  now: () => Date.now(),
  randomCode: () => String(100000 + Math.floor(Math.random() * 900000)),
  randomToken: () => (++tokenN).toString(16).padStart(64, "b"),
};

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const r = await handle(
      new Request(`http://svc.test${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
      }),
      svcEnv,
      deps,
    );
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(await r.text());
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  process.env.MARKET_KASA_MAIL_SERVICE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(async () => {
  delete process.env.MARKET_KASA_MAIL_SERVICE;
  setTestCtxFactory(undefined);
  await new Promise((ok) => server.close(ok));
});

let env: TestEnv;
let p: ReturnType<typeof seedSample>;
beforeEach(() => {
  env = createEnv("2026-10-06T09:00:00.000Z");
  p = seedSample(env);
  setTestCtxFactory(() => env.ctx);
  resetLimiterForTests();
  svcEnv = { KV: new MemKV(), RESEND_API_KEY: "test", FROM_ADDRESS: "Optiva <bildirim@test.local>" };
  outbox = [];
});
afterEach(() => setTestCtxFactory(undefined));

function req(path: string, cookie: string, body: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { host: "localhost:3000", cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const lastCode = () => /(\d{6})/.exec(outbox.at(-1)?.subject ?? "")![1]!;

describe("merkezi e-posta servisi ile bağlama", () => {
  it("adres yaz → servis kodu → doğrula: gönderim servise bağlanır; gün sonu raporu ve şifre kodu servis üzerinden gider", async () => {
    const { owner, cashier } = ensureUsers(env);
    const cookie = await cookieForUser(owner);
    expect(isMailConfigured(env.db)).toBe(false);

    // kasiyer bağlayamaz
    expect((await svcStartRoute.POST(req("/api/settings/mail/service/start", await cookieForUser(cashier), { email: "dukkan@ornek.com" }))).status).toBe(403);

    const st = await svcStartRoute.POST(req("/api/settings/mail/service/start", cookie, { email: "Dukkan@Ornek.com" }));
    expect(st.status).toBe(200);
    expect((await json(st)).emailMasked).toMatch(/^d\*+@ornek\.com$/);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toEqual(["dukkan@ornek.com"]);
    // kurulum kimliği şifreli saklanır (düz metin değil)
    const enc = readServiceCreds(env.db)!;
    expect(enc).toMatch(/^v1\./);
    expect(enc).not.toMatch(/[a-f0-9]{32}\.[a-f0-9]{64}/);
    expect(decryptSecret(enc)).toMatch(/^[a-f0-9]{32}\.[a-f0-9]{64}$/);

    // yanlış kod → hata, bağlanmaz
    const wrong = await svcConfirmRoute.POST(req("/api/settings/mail/service/confirm", cookie, { email: "dukkan@ornek.com", code: lastCode() === "000000" ? "111111" : "000000" }));
    expect(wrong.status).toBe(400);
    expect((await json(wrong)).error.code).toBe("CODE_WRONG");
    expect(usesMailService(env.db)).toBe(false);

    const ok = await svcConfirmRoute.POST(req("/api/settings/mail/service/confirm", cookie, { email: "dukkan@ornek.com", code: lastCode() }));
    expect(ok.status).toBe(200);
    expect((await json(ok)).mail).toMatchObject({ configured: true, provider: "service", user: "dukkan@ornek.com" });
    expect(usesMailService(env.db)).toBe(true);
    expect(readMailConfig(env.db)!.host).toBe(process.env.MARKET_KASA_MAIL_SERVICE!.replace(/\/$/, ""));
    expect(getUserById(env.db, owner.id)!.email).toBe("dukkan@ornek.com");
    const audit = env.db.prepare("SELECT summary FROM audit_log WHERE action = 'settings.update' ORDER BY id DESC LIMIT 1").get() as { summary: string };
    expect(audit.summary).toContain("e-posta servisine bağlandı");

    // gün sonu raporu: servis üzerinden, Excel ekleriyle
    const ctx = { ...env.ctx, actor: { userId: cashier.id, name: cashier.name, role: "cashier" as const } };
    completeSale(ctx, { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 2 }], paymentMethod: "cash" }, { role: "cashier" });
    outbox = [];
    const rep = await sendDailyReport(env.ctx, "2026-10-06", "manual");
    expect(rep).toEqual({ status: "sent", recipients: ["dukkan@ornek.com"] });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.subject).toContain("2026");
    expect(outbox[0]!.attachments!.length).toBeGreaterThanOrEqual(1);
    expect(outbox[0]!.attachments!.every((a) => a.filename.endsWith(".xlsx") && a.content.length > 100)).toBe(true);

    // şifremi unuttum kodu da servis üzerinden yöneticiye gider
    outbox = [];
    const fg = await forgotStartRoute.POST(req("/api/auth/forgot/start", "", { username: "yonetici" }));
    expect(fg.status).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toEqual(["dukkan@ornek.com"]);
  });

  it("servis doğrulanmamış adrese göndermez; servis kapalıysa anlaşılır hata", async () => {
    const { owner } = ensureUsers(env);
    const cookie = await cookieForUser(owner);
    await svcStartRoute.POST(req("/api/settings/mail/service/start", cookie, { email: "dukkan@ornek.com" }));
    await svcConfirmRoute.POST(req("/api/settings/mail/service/confirm", cookie, { email: "dukkan@ornek.com", code: lastCode() }));
    outbox = [];

    // doğrulanmış + doğrulanmamış alıcı: yalnızca doğrulanmışa gider
    await sendMail(env.db, { to: ["dukkan@ornek.com", "yabanci@baska.com"], subject: "Deneme", text: "x", html: "<p>x</p>" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toEqual(["dukkan@ornek.com"]);

    // servise ulaşılamıyor → MAIL_SERVICE_UNREACHABLE (program çökmez, rapor "failed" döner)
    const saved = process.env.MARKET_KASA_MAIL_SERVICE;
    process.env.MARKET_KASA_MAIL_SERVICE = "http://127.0.0.1:9";
    try {
      const r = await svcStartRoute.POST(req("/api/settings/mail/service/start", cookie, { email: "dukkan@ornek.com" }));
      expect(r.status).toBe(502);
      expect((await json(r)).error.code).toBe("MAIL_SERVICE_UNREACHABLE");
    } finally {
      process.env.MARKET_KASA_MAIL_SERVICE = saved;
    }
  });

  it("servis adresi tanımlı değilse bağlama ucu 409 döner", async () => {
    const { owner } = ensureUsers(env);
    const saved = process.env.MARKET_KASA_MAIL_SERVICE;
    delete process.env.MARKET_KASA_MAIL_SERVICE;
    try {
      const r = await svcStartRoute.POST(req("/api/settings/mail/service/start", await cookieForUser(owner), { email: "dukkan@ornek.com" }));
      expect(r.status).toBe(409);
      expect((await json(r)).error.code).toBe("MAIL_SERVICE_OFF");
    } finally {
      process.env.MARKET_KASA_MAIL_SERVICE = saved;
    }
  });
});
