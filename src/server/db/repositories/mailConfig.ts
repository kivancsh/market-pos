import type { DB } from "../types";

/** E-posta gönderim ayarları (settings tablosunda; şifre şifrelenmiş saklanır). */
export interface MailConfigRow {
  provider: string;
  host: string;
  port: number;
  user: string;
  passEnc: string;
}

const KEYS = { provider: "mail_provider", host: "mail_host", port: "mail_port", user: "mail_user", passEnc: "mail_pass_enc" } as const;

export function readMailConfig(db: DB): MailConfigRow | null {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'mail_%'").all() as { key: string; value: string }[];
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const host = m.get(KEYS.host);
  const user = m.get(KEYS.user);
  const passEnc = m.get(KEYS.passEnc);
  if (!host || !user || !passEnc) return null;
  return { provider: m.get(KEYS.provider) ?? "custom", host, port: Number(m.get(KEYS.port) ?? 465), user, passEnc };
}

export function writeMailConfig(db: DB, c: MailConfigRow): void {
  const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  stmt.run(KEYS.provider, c.provider);
  stmt.run(KEYS.host, c.host);
  stmt.run(KEYS.port, String(c.port));
  stmt.run(KEYS.user, c.user);
  stmt.run(KEYS.passEnc, c.passEnc);
}
