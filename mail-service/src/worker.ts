/**
 * Market Kasa e-posta servisi (Cloudflare Worker).
 *
 * Programlar (kurulumlar) e-postayı bu servis üzerinden gönderir; müşteri Gmail/uygulama şifresi ayarlamaz.
 * Kötüye kullanımı önlemek için:
 * - Her kurulum bir kez kayıt olur (installId + gizli anahtar); istekler bu anahtarla imzalanır.
 * - Serbest içerikli e-posta (rapor, onay kodu) YALNIZCA bu kurulum için doğrulanmış alıcılara gider.
 * - Alıcı doğrulama kodunu servis kendisi üretir ve gönderir (sabit şablon); kod doğru girilmeden adres doğrulanmaz.
 * - Kurulum / alıcı / gün başına sınırlar; ek boyutu sınırı.
 * - Yapay zekâ ucu yalnız aylık rapor yorumu üretir: istem sabittir (src/lib/assistantAi.ts), programdan yalnız veri paketi alınır;
 *   kurulum başına günlük/aylık ve servis geneli günlük sınır maliyeti sınırlar.
 *
 * Uç noktalar (JSON):
 *   POST /v1/install                         → { installId, token }
 *   POST /v1/recipients/start   {email}      → { ok, expiresInSec }       (Authorization: Bearer <installId>.<token>)
 *   POST /v1/recipients/confirm {email,code} → { ok }
 *   POST /v1/send {to[],subject,text,html,attachments[]} → { sent[], skipped[] }
 *   POST /v1/ai/monthly {payload}             → { report, model }   (aylık rapor yorumu; ANTHROPIC_API_KEY tanımlıysa)
 *   GET  /v1/health                          → { ok }
 */
import { AI_PAYLOAD_MAX_BYTES, AiPayloadSchema, type AiPayload } from "../../src/lib/assistantAi";
import { AiFailure, runClaudeMonthly } from "./ai";

// ------------------------------------------------------------------ ortam (Cloudflare tipleri olmadan, en küçük arayüz)
export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  KV: KV;
  /** Anthropic API anahtarı (wrangler secret put ANTHROPIC_API_KEY); yoksa yapay zekâ ucu kapalı */
  ANTHROPIC_API_KEY?: string;
  /** Resend API anahtarı (wrangler secret put RESEND_API_KEY) */
  RESEND_API_KEY: string;
  /** Gönderen, ör. "Market Kasa <bildirim@marketkasa.com>" (wrangler.toml [vars]) */
  FROM_ADDRESS: string;
}

export interface OutgoingEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}

export interface Deps {
  sendEmail(env: Env, email: OutgoingEmail): Promise<void>;
  /** Aylık rapor yorumu (gerçekte Claude; testlerde sahte) */
  runAi?(env: Env, payload: AiPayload): Promise<{ report: unknown; model: string }>;
  now(): number;
  randomCode(): string;
  randomToken(): string;
}

// ------------------------------------------------------------------ sınırlar
export const LIMITS = {
  installsPerIpPerDay: 10,
  codesPerInstallPerHour: 10,
  codesPerEmailPerHour: 5,
  codeTtlSec: 600,
  codeAttempts: 5,
  sendsPerInstallPerDay: 60,
  recipientsPerSend: 10,
  maxPayloadBytes: 6 * 1024 * 1024,
  aiPerInstallPerDay: 4,
  aiPerInstallPer30Days: 12,
  aiGlobalPerDay: 300,
};

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// ------------------------------------------------------------------ yardımcılar
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const defaultDeps: Deps = {
  async sendEmail(env, email) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.FROM_ADDRESS, ...email }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
  runAi: (env, payload) => runClaudeMonthly(env.ANTHROPIC_API_KEY!, payload),
  now: () => Date.now(),
  randomCode: () => String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0"),
  randomToken: () => hex(32),
};

/** Sabit pencereli sayaç: sınır aşıldıysa false. */
async function bump(env: Env, key: string, limit: number, windowSec: number, now: number): Promise<boolean> {
  const bucket = Math.floor(now / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  const n = Number((await env.KV.get(k)) ?? "0");
  if (n >= limit) return false;
  await env.KV.put(k, String(n + 1), { expirationTtl: windowSec + 60 });
  return true;
}

async function auth(req: Request, env: Env): Promise<string | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(h);
  if (!m) return null;
  const stored = await env.KV.get(`install:${m[1]}`);
  return stored && stored === (await sha256(m[2]!)) ? m[1]! : null;
}

const normEmail = (e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : "");

function codeEmail(code: string, email: string): OutgoingEmail {
  const text = `Market Kasa onay kodunuz: ${code}\n\nBu kod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayın.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">Market Kasa onay kodu</h1>
<p style="font-size:15px;color:#334155">E-posta adresinizi Market Kasa programına bağlamak için kodunuz:</p>
<p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:16px 0">${code}</p>
<p style="font-size:13px;color:#64748b">Kod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayın.</p></div>`;
  return { to: [email], subject: `Market Kasa onay kodu: ${code}`, text, html };
}

// ------------------------------------------------------------------ istek işleyici
export async function handle(req: Request, env: Env, deps: Deps = defaultDeps): Promise<Response> {
  const url = new URL(req.url);
  const now = deps.now();
  if (req.method === "GET" && url.pathname === "/v1/health") return json(200, { ok: true });
  if (req.method !== "POST") return fail(405, "METHOD", "Desteklenmeyen istek.");
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > LIMITS.maxPayloadBytes) return fail(413, "TOO_LARGE", "E-posta çok büyük.");
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (url.pathname === "/v1/install") {
    const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await bump(env, `inst-ip:${ip}`, LIMITS.installsPerIpPerDay, 86400, now))) return fail(429, "RATE_LIMIT", "Çok fazla kayıt denemesi. Yarın tekrar deneyin.");
    const installId = deps.randomToken().slice(0, 32);
    const token = deps.randomToken();
    await env.KV.put(`install:${installId}`, await sha256(token));
    return json(200, { installId, token });
  }

  const installId = await auth(req, env);
  if (!installId) return fail(401, "UNAUTHORIZED", "Kurulum kimliği geçersiz.");

  if (url.pathname === "/v1/recipients/start") {
    const email = normEmail(body.email);
    if (!EMAIL_RE.test(email)) return fail(400, "BAD_EMAIL", "Geçerli bir e-posta adresi yazın.");
    if (!(await bump(env, `codes:${installId}`, LIMITS.codesPerInstallPerHour, 3600, now))) return fail(429, "RATE_LIMIT", "Çok fazla kod istendi. Biraz sonra tekrar deneyin.");
    if (!(await bump(env, `codes-email:${email}`, LIMITS.codesPerEmailPerHour, 3600, now))) return fail(429, "RATE_LIMIT", "Bu adrese çok fazla kod gönderildi. Biraz sonra tekrar deneyin.");
    const code = deps.randomCode();
    await env.KV.put(`code:${installId}:${email}`, JSON.stringify({ hash: await sha256(`${installId}:${email}:${code}`), attempts: 0 }), { expirationTtl: LIMITS.codeTtlSec });
    try {
      await deps.sendEmail(env, codeEmail(code, email));
    } catch {
      return fail(502, "SEND_FAILED", "Kod e-postası gönderilemedi. Adresi kontrol edip tekrar deneyin.");
    }
    return json(200, { ok: true, expiresInSec: LIMITS.codeTtlSec });
  }

  if (url.pathname === "/v1/recipients/confirm") {
    const email = normEmail(body.email);
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    const key = `code:${installId}:${email}`;
    const raw = await env.KV.get(key);
    if (!raw) return fail(400, "CODE_EXPIRED", "Kodun süresi doldu ya da kod istenmedi. Yeni kod isteyin.");
    const rec = JSON.parse(raw) as { hash: string; attempts: number };
    if (rec.attempts >= LIMITS.codeAttempts) {
      await env.KV.delete(key);
      return fail(400, "CODE_LOCKED", "Çok fazla yanlış deneme. Yeni kod isteyin.");
    }
    if (rec.hash !== (await sha256(`${installId}:${email}:${code}`))) {
      await env.KV.put(key, JSON.stringify({ ...rec, attempts: rec.attempts + 1 }), { expirationTtl: LIMITS.codeTtlSec });
      return fail(400, "CODE_WRONG", `Kod hatalı. Kalan deneme: ${LIMITS.codeAttempts - rec.attempts - 1}`);
    }
    await env.KV.delete(key);
    await env.KV.put(`verified:${installId}:${email}`, "1");
    return json(200, { ok: true });
  }

  if (url.pathname === "/v1/send") {
    const to = Array.isArray(body.to) ? body.to.map(normEmail).filter((e) => EMAIL_RE.test(e)) : [];
    if (to.length === 0 || to.length > LIMITS.recipientsPerSend) return fail(400, "BAD_RECIPIENTS", "Alıcı yok ya da çok fazla.");
    const subject = typeof body.subject === "string" ? body.subject.slice(0, 200) : "";
    const text = typeof body.text === "string" ? body.text : "";
    const html = typeof body.html === "string" ? body.html : "";
    if (!subject || (!text && !html)) return fail(400, "BAD_MESSAGE", "Konu ve içerik gerekli.");
    const attachments = Array.isArray(body.attachments)
      ? (body.attachments as { filename?: unknown; content?: unknown }[])
          .filter((a) => typeof a.filename === "string" && typeof a.content === "string")
          .slice(0, 5)
          .map((a) => ({ filename: String(a.filename).slice(0, 120), content: String(a.content) }))
      : [];
    const sent: string[] = [];
    const skipped: string[] = [];
    for (const e of to) ((await env.KV.get(`verified:${installId}:${e}`)) ? sent : skipped).push(e);
    if (sent.length === 0) return fail(403, "NOT_VERIFIED", "Alıcı adres doğrulanmamış. Ayarlar → E-posta'dan adresi kodla doğrulayın.");
    if (!(await bump(env, `send:${installId}`, LIMITS.sendsPerInstallPerDay, 86400, now))) return fail(429, "RATE_LIMIT", "Günlük e-posta sınırına ulaşıldı.");
    try {
      await deps.sendEmail(env, { to: sent, subject, text, html, ...(attachments.length ? { attachments } : {}) });
    } catch {
      return fail(502, "SEND_FAILED", "E-posta gönderilemedi. Biraz sonra tekrar deneyin.");
    }
    return json(200, { sent, skipped });
  }

  if (url.pathname === "/v1/ai/monthly") {
    const installId = await auth(req, env);
    if (!installId) return fail(401, "UNAUTHORIZED", "Kurulum anahtarı geçersiz.");
    if (!env.ANTHROPIC_API_KEY || !deps.runAi) return fail(503, "AI_DISABLED", "Bulut yapay zekâ şu an kapalı; yerleşik asistanın yorumu geçerli.");
    if (len > AI_PAYLOAD_MAX_BYTES) return fail(413, "TOO_LARGE", "Rapor verisi çok büyük.");
    const parsed = AiPayloadSchema.safeParse(body.payload);
    if (!parsed.success) return fail(400, "BAD_PAYLOAD", "Rapor verisi hatalı.");
    if (JSON.stringify(parsed.data).length > AI_PAYLOAD_MAX_BYTES) return fail(413, "TOO_LARGE", "Rapor verisi çok büyük.");
    if (!(await bump(env, `ai:${installId}`, LIMITS.aiPerInstallPerDay, 86400, now))) return fail(429, "RATE_LIMIT", "Bugünkü yapay zekâ hakkı doldu; yarın yeniden denenecek.");
    if (!(await bump(env, `ai30:${installId}`, LIMITS.aiPerInstallPer30Days, 30 * 86400, now))) return fail(429, "RATE_LIMIT", "Bu ayki yapay zekâ hakkı doldu.");
    if (!(await bump(env, "ai-global", LIMITS.aiGlobalPerDay, 86400, now))) return fail(429, "RATE_LIMIT", "Servis bugün yoğun; yarın yeniden denenecek.");
    try {
      const r = await deps.runAi(env, parsed.data);
      return json(200, { report: r.report, model: r.model });
    } catch (e) {
      if (e instanceof AiFailure) return fail(e.status, e.code, e.message);
      return fail(502, "AI_FAILED", "Yapay zekâ yorumu alınamadı.");
    }
  }

  return fail(404, "NOT_FOUND", "Bulunamadı.");
}

const worker = {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env);
  },
};
export default worker;
