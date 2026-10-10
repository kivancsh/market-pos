/**
 * E-posta gönderimi (onay kodları, günlük rapor).
 * Ayarlar settings tablosunda; uygulama şifresi AES-256-GCM ile şifrelenmiş saklanır (anahtar: oturum gizli anahtarı).
 *
 * Testler için: setTestMailSender() (birim/entegrasyon testleri) ya da MAIL_DEV_DIR ortam değişkeni
 * (e-postaları göndermek yerine o klasöre JSON olarak yazar; uçtan uca testler ve kurulum testi). Kurulum dosyaları
 * bu değişkeni ayarlamaz; gerçek kullanımda her zaman SMTP kullanılır.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { getSessionSecret } from "../auth/secret";
import { readMailConfig, writeMailConfig } from "../db/repositories/mailConfig";
import type { DB } from "../db/types";
import { AppError } from "../errors";

export const MAIL_PROVIDERS = {
  gmail: { label: "Gmail", host: "smtp.gmail.com", port: 465 },
  outlook: { label: "Outlook / Hotmail", host: "smtp-mail.outlook.com", port: 587 },
  icloud: { label: "iCloud", host: "smtp.mail.me.com", port: 587 },
  yandex: { label: "Yandex", host: "smtp.yandex.com", port: 465 },
  custom: { label: "Diğer (SMTP)", host: "", port: 465 },
} as const;
export type MailProvider = keyof typeof MAIL_PROVIDERS;

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
}

export interface MailSender {
  send(msg: MailMessage): Promise<void>;
}

export interface MailSettingsInput {
  provider: MailProvider;
  user: string;
  pass: string;
  host?: string;
  port?: number;
}

/** Ekranda gösterilecek ayar özeti (şifre asla dışarı çıkmaz). */
export interface MailStatus {
  configured: boolean;
  provider: MailProvider | null;
  user: string | null;
  host: string | null;
  port: number | null;
}

// ------------------------------------------------------------------ şifreleme
function key(): Buffer {
  return crypto.createHash("sha256").update(`market-kasa-mail:${getSessionSecret()}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string | null {
  try {
    const [v, iv, tag, data] = blob.split(".");
    if (v !== "v1" || !iv || !tag || !data) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null; // anahtar değişmiş: ayarların yeniden girilmesi gerekir
  }
}

// ------------------------------------------------------------------ ayarlar
export function getMailStatus(db: DB): MailStatus {
  const c = readMailConfig(db);
  const testMode = Boolean(process.env.MAIL_DEV_DIR || testSender);
  if (!c || decryptSecret(c.passEnc) === null) {
    // Test modunda hesap girilmemiş olsa da gönderim çalışır (posta dosyaya/yakalayıcıya gider).
    return testMode
      ? { configured: true, provider: "custom", user: "test@market-kasa.local", host: "test", port: 0 }
      : { configured: false, provider: null, user: null, host: null, port: null };
  }
  return { configured: true, provider: c.provider as MailProvider, user: c.user, host: c.host, port: c.port };
}

export function isMailConfigured(db: DB): boolean {
  return getMailStatus(db).configured;
}

function resolveSettings(input: MailSettingsInput): { provider: MailProvider; host: string; port: number; user: string; pass: string } {
  const preset = MAIL_PROVIDERS[input.provider];
  const host = (input.provider === "custom" ? input.host : preset.host)?.trim() ?? "";
  const port = input.provider === "custom" ? (input.port ?? 465) : preset.port;
  // Google uygulama şifresi 4'erli gruplar halinde gösterilir; boşluklar şifreye dahil değildir
  const pass = input.provider === "gmail" ? input.pass.replace(/\s+/g, "") : input.pass;
  return { provider: input.provider, host, port, user: input.user.trim(), pass };
}

function transportFor(s: { host: string; port: number; user: string; pass: string }) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** SMTP girişini dener; başarılıysa ayarları kaydeder. */
export async function saveMailSettings(db: DB, input: MailSettingsInput): Promise<MailStatus> {
  const s = resolveSettings(input);
  if (!s.host) throw new AppError("MAIL_HOST_REQUIRED", "SMTP sunucu adresini yazın.", 400);
  if (!process.env.MAIL_DEV_DIR && !testSender) {
    try {
      await transportFor(s).verify();
    } catch (e) {
      throw new AppError("MAIL_LOGIN_FAILED", friendlyMailError(e, input.provider), 400);
    }
  }
  writeMailConfig(db, { provider: s.provider, host: s.host, port: s.port, user: s.user, passEnc: encryptSecret(s.pass) });
  return getMailStatus(db);
}

/** SMTP hatalarını sade Türkçeye çevirir. */
export function friendlyMailError(e: unknown, provider?: string): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  if (err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534) {
    return provider === "gmail"
      ? "Gmail girişi reddedildi. Normal Gmail şifresi değil, Google hesabınızdan alınan 16 haneli 'uygulama şifresi' gerekir (2 adımlı doğrulama açık olmalı)."
      : "E-posta girişi reddedildi. Adresi ve (uygulama) şifresini kontrol edin.";
  }
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET" || err.code === "EDNS" || err.code === "ENOTFOUND") {
    return "E-posta sunucusuna bağlanılamadı. İnternet bağlantısını kontrol edin.";
  }
  return `E-posta gönderilemedi (${err.code ?? err.message ?? "bilinmeyen hata"}).`;
}

// ------------------------------------------------------------------ gönderim
let testSender: MailSender | null = null;

/** Testler: gönderilen e-postaları yakalamak için. */
export function setTestMailSender(s: MailSender | null): void {
  testSender = s;
}

export async function sendMail(db: DB, msg: MailMessage): Promise<void> {
  if (testSender) return testSender.send(msg);
  const devDir = process.env.MAIL_DEV_DIR;
  if (devDir) {
    fs.mkdirSync(devDir, { recursive: true });
    const file = path.join(devDir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}.json`);
    const record = { ...msg, attachments: (msg.attachments ?? []).map((a) => ({ filename: a.filename, size: a.content.length })) };
    fs.writeFileSync(file, JSON.stringify(record, null, 1));
    return;
  }
  const c = readMailConfig(db);
  const pass = c ? decryptSecret(c.passEnc) : null;
  if (!c || pass === null) {
    throw new AppError(
      "MAIL_NOT_CONFIGURED",
      "E-posta gönderimi ayarlanmamış. Ayarlar → E-posta bölümünden gönderen e-posta hesabını girin.",
      409,
    );
  }
  try {
    await transportFor({ host: c.host, port: c.port, user: c.user, pass }).sendMail({
      from: { name: "Market Kasa", address: c.user },
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      attachments: msg.attachments,
    });
  } catch (e) {
    throw new AppError("MAIL_SEND_FAILED", friendlyMailError(e, c.provider), 502);
  }
}

/** a***@gmail.com biçiminde gizler. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local[0]}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}
