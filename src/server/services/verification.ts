/**
 * E-posta onay kodları: 6 haneli, 10 dakika geçerli, en fazla 5 deneme, tek kullanımlık.
 * Kod veritabanında düz saklanmaz (HMAC-SHA256). Aynı e-postaya yeni kod için 60 sn beklenir.
 */
import crypto from "node:crypto";
import { getSessionSecret } from "../auth/secret";
import type { Ctx } from "../context";
import {
  deleteVerification,
  getVerificationByToken,
  incrementAttempts,
  insertVerification,
  invalidateOpen,
  latestVerification,
  markUsed,
  purgeOldVerifications,
  type VerificationPurpose,
  type VerificationRow,
} from "../db/repositories/verification";
import { getSettings } from "../db/repositories/settings";
import { AppError, badRequest } from "../errors";
import { maskEmail, sendMail } from "../mail";
import { codeEmail } from "../mail/templates";

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_WAIT_MS = 60_000;
export const MAX_CODE_ATTEMPTS = 5;

export interface ChallengeInfo {
  token: string;
  emailMasked: string;
  expiresAt: string;
}

function hashCode(token: string, code: string): string {
  return crypto.createHmac("sha256", `market-kasa-code:${getSessionSecret()}`).update(`${token}:${code}`).digest("hex");
}

/** Kodu üretir, kaydeder ve e-postayla gönderir. Gönderim başarısızsa kayıt silinir. */
export async function sendChallenge(
  ctx: Ctx,
  opts: { purpose: VerificationPurpose; email: string; userId: number | null; payload?: unknown; action: string },
): Promise<ChallengeInfo> {
  const now = ctx.now();
  const nowIso = now.toISOString();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();

  const id = ctx.db
    .transaction((): number => {
      const last = latestVerification(ctx.db, opts.purpose, opts.email);
      if (last && !last.usedAt && now.getTime() - Date.parse(last.createdAt) < RESEND_WAIT_MS) {
        const wait = Math.ceil((RESEND_WAIT_MS - (now.getTime() - Date.parse(last.createdAt))) / 1000);
        throw new AppError("CODE_TOO_SOON", `Yeni kod için ${wait} saniye bekleyin.`, 429, { retryAfterSeconds: wait });
      }
      purgeOldVerifications(ctx.db, new Date(now.getTime() - 86_400_000).toISOString());
      invalidateOpen(ctx.db, opts.purpose, opts.email, nowIso);
      return insertVerification(ctx.db, {
        token,
        purpose: opts.purpose,
        userId: opts.userId,
        email: opts.email,
        codeHash: hashCode(token, code),
        payloadJson: opts.payload === undefined ? null : JSON.stringify(opts.payload),
        createdAt: nowIso,
        expiresAt,
      });
    })
    .immediate();

  try {
    await sendMail(ctx.db, { to: opts.email, ...codeEmail(getSettings(ctx.db).businessName, opts.action, code) });
  } catch (e) {
    ctx.db.transaction(() => deleteVerification(ctx.db, id)).immediate();
    throw e;
  }
  return { token, emailMasked: maskEmail(opts.email), expiresAt };
}

/**
 * Kodu doğrular ve TÜKETİR (tek kullanım). Hatalı denemeler sayılır ve kalıcıdır.
 * Çağıran, işlemin girdilerini ÖNCE doğrulamalı (kod boşa harcanmasın).
 */
export function consumeChallenge(ctx: Ctx, token: string, code: string, purpose: VerificationPurpose): VerificationRow {
  const nowIso = ctx.now().toISOString();
  const cleanCode = String(code ?? "").replace(/\s+/g, "");
  const r = ctx.db
    .transaction((): { ok: true; row: VerificationRow } | { ok: false; error: AppError } => {
      const row = getVerificationByToken(ctx.db, String(token ?? ""));
      if (!row || row.purpose !== purpose || row.usedAt) {
        return { ok: false, error: badRequest("CODE_INVALID", "Bu kod artık geçerli değil. Yeni kod isteyin.") };
      }
      if (Date.parse(row.expiresAt) < Date.parse(nowIso)) {
        return { ok: false, error: badRequest("CODE_EXPIRED", "Kodun süresi doldu (10 dakika). Yeni kod isteyin.") };
      }
      if (row.attempts >= MAX_CODE_ATTEMPTS) {
        return { ok: false, error: badRequest("CODE_LOCKED", "Çok fazla hatalı deneme. Yeni kod isteyin.") };
      }
      const expected = Buffer.from(row.codeHash, "hex");
      const given = Buffer.from(hashCode(row.token, cleanCode), "hex");
      if (!/^\d{6}$/.test(cleanCode) || !crypto.timingSafeEqual(expected, given)) {
        incrementAttempts(ctx.db, row.id);
        const left = MAX_CODE_ATTEMPTS - row.attempts - 1;
        return {
          ok: false,
          error: badRequest(
            "CODE_WRONG",
            left > 0 ? `Kod hatalı. Kalan deneme: ${left}` : "Kod hatalı. Deneme hakkınız bitti; yeni kod isteyin.",
            { remainingAttempts: left },
          ),
        };
      }
      markUsed(ctx.db, row.id, nowIso);
      return { ok: true, row };
    })
    .immediate();
  if (!r.ok) throw r.error;
  return r.row;
}
