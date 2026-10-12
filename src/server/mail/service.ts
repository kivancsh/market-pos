/**
 * Merkezi "Market Kasa e-posta servisi" istemcisi (servisin kodu: mail-service/).
 * Müşteri Gmail/uygulama şifresi ayarlamaz: sadece kendi e-posta adresini yazar, servis o adrese kod gönderir;
 * kod doğru girilince adres bu kurulum için doğrulanır ve rapor/kodlar servis üzerinden gider.
 *
 * Servis adresi: yayına alınınca DEFAULT_MAIL_SERVICE_URL'e yazılır; testler MARKET_KASA_MAIL_SERVICE ile başka adres verebilir.
 * Adres boşsa servis yok sayılır (Gmail ile bağlama yolu kullanılır).
 */
import type { DB } from "../db/types";
import { readServiceCreds, writeServiceCreds } from "../db/repositories/mailConfig";
import { AppError } from "../errors";
import type { MailMessage } from "./index";

/** Servis yayına alınınca buraya adresi yazılır (ör. "https://market-kasa-mail.<hesap>.workers.dev"). */
const DEFAULT_MAIL_SERVICE_URL = "";
const TIMEOUT_MS = 20_000;

export function mailServiceUrl(): string {
  return (process.env.MARKET_KASA_MAIL_SERVICE ?? DEFAULT_MAIL_SERVICE_URL).replace(/\/+$/, "");
}

export function mailServiceAvailable(): boolean {
  return mailServiceUrl() !== "";
}

type Crypto = { encrypt(s: string): string; decrypt(s: string): string | null };

async function call(path: string, body: unknown, auth?: string, timeoutMs = TIMEOUT_MS): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${mailServiceUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AppError("MAIL_SERVICE_UNREACHABLE", "Market Kasa servisine bağlanılamadı. İnternet bağlantısını kontrol edin.", 502);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data.error ?? {}) as { code?: string; message?: string };
    throw new AppError(err.code ?? "MAIL_SERVICE_ERROR", err.message ?? `E-posta servisi hatası (${res.status}).`, res.status === 429 ? 429 : res.status >= 500 ? 502 : 400);
  }
  return data;
}

/** Bu kurulumun servis kimliği; yoksa servise kayıt olur ve şifreli saklar. */
export async function ensureServiceInstall(db: DB, c: Crypto): Promise<string> {
  const enc = readServiceCreds(db);
  const existing = enc ? c.decrypt(enc) : null;
  if (existing) return existing;
  const r = await call("/v1/install", {});
  const creds = `${String(r.installId)}.${String(r.token)}`;
  writeServiceCreds(db, c.encrypt(creds));
  return creds;
}

export async function serviceRecipientStart(db: DB, c: Crypto, email: string): Promise<void> {
  await call("/v1/recipients/start", { email }, await ensureServiceInstall(db, c));
}

export async function serviceRecipientConfirm(db: DB, c: Crypto, email: string, code: string): Promise<void> {
  await call("/v1/recipients/confirm", { email, code }, await ensureServiceInstall(db, c));
}

export async function serviceSend(creds: string, msg: MailMessage): Promise<{ sent: string[]; skipped: string[] }> {
  const r = await call(
    "/v1/send",
    {
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      attachments: (msg.attachments ?? []).map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    },
    creds,
  );
  return { sent: (r.sent as string[]) ?? [], skipped: (r.skipped as string[]) ?? [] };
}

/**
 * Aylık rapor yorumu (merkezi yapay zekâ). Servis Claude'u kendi anahtarıyla, sabit istemle çağırır; programdan yalnız
 * hesaplanmış rakamlar (veri paketi) gider. Yanıt birkaç dakika sürebilir.
 */
export async function serviceAiMonthly(creds: string, payload: unknown): Promise<{ report: unknown; model: string }> {
  const r = await call("/v1/ai/monthly", { payload }, creds, 6 * 60_000);
  return { report: r.report, model: String(r.model ?? "") };
}
