import { apiRoute, readJson } from "@/server/http/api";
import { maskEmail, startServiceVerification, usesMailService } from "@/server/mail";
import { prepareEmailChange } from "@/server/services/users";
import { CODE_TTL_MS, sendChallenge } from "@/server/services/verification";

/**
 * E-posta ekleme/değiştirme 1. adım: kod YENİ adrese.
 * Merkezi e-posta servisi kullanılıyorsa kodu servis üretir ve doğrular (adres servis için de doğrulanmış olur).
 */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const p = prepareEmailChange(ctx, await readJson(req));
  if (usesMailService(ctx.db)) {
    await startServiceVerification(ctx.db, p.email);
    return { token: `svc:${p.email}`, emailMasked: maskEmail(p.email), expiresAt: new Date(ctx.now().getTime() + CODE_TTL_MS).toISOString() };
  }
  return sendChallenge(ctx, { purpose: "change_email", email: p.email, userId: p.userId, payload: p.payload, action: p.action });
});
