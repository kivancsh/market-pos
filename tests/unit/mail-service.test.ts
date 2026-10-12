import { beforeEach, describe, expect, it } from "vitest";
import { handle, LIMITS, type Deps, type Env, type KV, type OutgoingEmail } from "../../mail-service/src/worker";

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

let env: Env;
let sent: OutgoingEmail[];
let codeSeq: string[];
let tokenN: number;
let deps: Deps;

beforeEach(() => {
  env = { KV: new MemKV(), RESEND_API_KEY: "test", FROM_ADDRESS: "Market Kasa <bildirim@test.local>" };
  sent = [];
  codeSeq = ["123456", "654321", "111111"];
  tokenN = 0;
  deps = {
    sendEmail: async (_e, m) => void sent.push(m),
    now: () => Date.parse("2026-10-11T10:00:00Z"),
    randomCode: () => codeSeq.shift() ?? "999999",
    randomToken: () => (++tokenN).toString(16).padStart(64, "a"),
  };
});

const call = (path: string, body: unknown = {}, auth?: string, ip = "1.2.3.4") =>
  handle(
    new Request(`https://mail.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify(body),
    }),
    env,
    deps,
  );
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function install() {
  const r = await json(await call("/v1/install"));
  return `${r.installId}.${r.token}`;
}

describe("Market Kasa e-posta servisi", () => {
  it("kayıt → alıcı doğrulama (servis kodu) → yalnızca doğrulanmış alıcıya gönderim", async () => {
    const auth = await install();
    // doğrulanmamış adrese serbest içerik gönderilemez
    expect((await call("/v1/send", { to: ["ayse@ornek.com"], subject: "Rapor", html: "<p>x</p>" }, auth)).status).toBe(403);

    const st = await call("/v1/recipients/start", { email: "Ayse@Ornek.com" }, auth);
    expect(st.status).toBe(200);
    expect(sent[0]).toMatchObject({ to: ["ayse@ornek.com"], subject: "Market Kasa onay kodu: 123456" });

    const wrong = await json(await call("/v1/recipients/confirm", { email: "ayse@ornek.com", code: "000000" }, auth));
    expect(wrong.error.code).toBe("CODE_WRONG");
    expect((await call("/v1/recipients/confirm", { email: "ayse@ornek.com", code: "123456" }, auth)).status).toBe(200);

    const r = await json(await call("/v1/send", { to: ["ayse@ornek.com", "baskasi@ornek.com"], subject: "Günlük rapor", text: "t", html: "<p>h</p>", attachments: [{ filename: "a.xlsx", content: "QUJD" }] }, auth));
    expect(r).toEqual({ sent: ["ayse@ornek.com"], skipped: ["baskasi@ornek.com"] });
    expect(sent.at(-1)).toMatchObject({ to: ["ayse@ornek.com"], subject: "Günlük rapor", attachments: [{ filename: "a.xlsx", content: "QUJD" }] });
  });

  it("başka kurulumun doğruladığı adres bu kuruluma açık değil; anahtarsız istek reddedilir", async () => {
    const a = await install();
    const b = await install();
    await call("/v1/recipients/start", { email: "x@ornek.com" }, a);
    await call("/v1/recipients/confirm", { email: "x@ornek.com", code: "123456" }, a);
    expect((await call("/v1/send", { to: ["x@ornek.com"], subject: "s", text: "t" }, b)).status).toBe(403);
    expect((await call("/v1/send", { to: ["x@ornek.com"], subject: "s", text: "t" })).status).toBe(401);
    expect((await call("/v1/send", { to: ["x@ornek.com"], subject: "s", text: "t" }, `${a.split(".")[0]}.${"b".repeat(64)}`)).status).toBe(401);
  });

  it("5 yanlış denemede kod iptal; aynı adrese saatte en fazla 5 kod; IP başına kayıt sınırı", async () => {
    const auth = await install();
    await call("/v1/recipients/start", { email: "y@ornek.com" }, auth);
    for (let i = 0; i < LIMITS.codeAttempts; i++) await call("/v1/recipients/confirm", { email: "y@ornek.com", code: "000000" }, auth);
    expect((await json(await call("/v1/recipients/confirm", { email: "y@ornek.com", code: "123456" }, auth))).error.code).toBe("CODE_LOCKED");

    for (let i = 1; i < LIMITS.codesPerEmailPerHour; i++) expect((await call("/v1/recipients/start", { email: "y@ornek.com" }, auth)).status).toBe(200);
    expect((await call("/v1/recipients/start", { email: "y@ornek.com" }, auth)).status).toBe(429);

    for (let i = 0; i < LIMITS.installsPerIpPerDay; i++) expect((await call("/v1/install", {}, undefined, "9.9.9.9")).status).toBe(200);
    expect((await call("/v1/install", {}, undefined, "9.9.9.9")).status).toBe(429);
  });
});

describe("merkezi yapay zekâ ucu (/v1/ai/monthly)", () => {
  const payload = {
    monthLabel: "Eylül 2026",
    isPartial: false,
    rapor: { kpi: { revenueGrossTL: "₺1.000,00" } },
    ruleActions: [],
    toplamKarPotansiyeli: { enAzTL: "₺0,00", enCokTL: "₺0,00" },
    nextTargets: [],
  };

  it("anahtar tanımlı değilse kapalı; kurulum anahtarı zorunlu; veri paketi denetlenir; günlük sınır", async () => {
    const creds = await install();
    expect((await call("/v1/ai/monthly", { payload }, creds)).status).toBe(503);

    let calls = 0;
    env = { ...env, ANTHROPIC_API_KEY: "test-key" };
    deps = { ...deps, runAi: async (_e, p) => ({ report: { headline: `yorum: ${p.monthLabel}`, n: ++calls }, model: "claude-opus-5-5" }) };
    expect((await call("/v1/ai/monthly", { payload })).status).toBe(401);
    expect((await call("/v1/ai/monthly", { payload: { monthLabel: "x" } }, creds)).status).toBe(400);
    expect((await call("/v1/ai/monthly", { payload: { ...payload, ruleActions: Array.from({ length: 41 }, () => ({})) } }, creds)).status).toBe(400);

    const ok = await json(await call("/v1/ai/monthly", { payload }, creds));
    expect(ok).toEqual({ report: { headline: "yorum: Eylül 2026", n: 1 }, model: "claude-opus-5-5" });
    for (let i = 1; i < LIMITS.aiPerInstallPerDay; i++) expect((await call("/v1/ai/monthly", { payload }, creds)).status).toBe(200);
    const limited = await call("/v1/ai/monthly", { payload }, creds);
    expect(limited.status).toBe(429);
    expect((await json(limited)).error.code).toBe("RATE_LIMIT");
    expect(calls).toBe(LIMITS.aiPerInstallPerDay);
  });

  it("yapay zekâ hatası düzgün hata koduyla döner", async () => {
    const creds = await install();
    env = { ...env, ANTHROPIC_API_KEY: "test-key" };
    deps = {
      ...deps,
      runAi: async () => {
        throw new Error("beklenmedik");
      },
    };
    const r = await call("/v1/ai/monthly", { payload }, creds);
    expect(r.status).toBe(502);
    expect((await json(r)).error.code).toBe("AI_FAILED");
  });
});
