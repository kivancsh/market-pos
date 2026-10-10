import { apiRoute, readJson } from "@/server/http/api";
import { maskEmail, startServiceVerification } from "@/server/mail";
import { mailServiceAvailable } from "@/server/mail/service";
import { AppError } from "@/server/errors";
import { emailSchema } from "@/server/services/users";
import { CODE_TTL_MS } from "@/server/services/verification";
import { parseInput, z } from "@/server/validation/zod";

/** "E-posta bağla" (merkezi servis) 1. adım: yöneticinin adresine servis kod gönderir. */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  if (!mailServiceAvailable()) throw new AppError("MAIL_SERVICE_OFF", "E-posta servisi henüz açık değil.", 409);
  const { email } = parseInput(z.object({ email: emailSchema }), await readJson(req));
  await startServiceVerification(ctx.db, email);
  return { token: `svc:${email}`, emailMasked: maskEmail(email), expiresAt: new Date(ctx.now().getTime() + CODE_TTL_MS).toISOString() };
});
