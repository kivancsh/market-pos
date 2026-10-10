import type { DB } from "../types";

export type VerificationPurpose = "setup" | "forgot_password" | "change_secret" | "change_email";

export interface VerificationRow {
  id: number;
  token: string;
  purpose: VerificationPurpose;
  userId: number | null;
  email: string;
  codeHash: string;
  payloadJson: string | null;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

const SELECT = `SELECT id, token, purpose, user_id AS userId, email, code_hash AS codeHash, payload_json AS payloadJson,
                       attempts, created_at AS createdAt, expires_at AS expiresAt, used_at AS usedAt
                  FROM verification_codes`;

export function insertVerification(db: DB, v: Omit<VerificationRow, "id" | "attempts" | "usedAt">): number {
  return Number(
    db
      .prepare(
        `INSERT INTO verification_codes (token, purpose, user_id, email, code_hash, payload_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(v.token, v.purpose, v.userId, v.email, v.codeHash, v.payloadJson, v.createdAt, v.expiresAt).lastInsertRowid,
  );
}

export function getVerificationByToken(db: DB, token: string): VerificationRow | undefined {
  return db.prepare(`${SELECT} WHERE token = ?`).get(token) as VerificationRow | undefined;
}

/** Aynı amaç + e-posta için en son oluşturulan (yeniden gönderme sıklığını sınırlamak için). */
export function latestVerification(db: DB, purpose: VerificationPurpose, email: string): VerificationRow | undefined {
  return db.prepare(`${SELECT} WHERE purpose = ? AND email = ? ORDER BY id DESC LIMIT 1`).get(purpose, email) as
    | VerificationRow
    | undefined;
}

export function incrementAttempts(db: DB, id: number): void {
  db.prepare("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?").run(id);
}

export function markUsed(db: DB, id: number, nowIso: string): void {
  db.prepare("UPDATE verification_codes SET used_at = ? WHERE id = ?").run(nowIso, id);
}

/** Aynı amaç + e-posta için açıkta kalan eski kodları geçersiz kılar (yeni kod gönderilince). */
export function invalidateOpen(db: DB, purpose: VerificationPurpose, email: string, nowIso: string): void {
  db.prepare("UPDATE verification_codes SET used_at = ? WHERE purpose = ? AND email = ? AND used_at IS NULL").run(
    nowIso,
    purpose,
    email,
  );
}

export function deleteVerification(db: DB, id: number): void {
  db.prepare("DELETE FROM verification_codes WHERE id = ?").run(id);
}

/** 1 günden eski kayıtları temizler. */
export function purgeOldVerifications(db: DB, beforeIso: string): void {
  db.prepare("DELETE FROM verification_codes WHERE created_at < ?").run(beforeIso);
}
