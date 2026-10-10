import { apiRoute, readJson } from "@/server/http/api";
import { applyForgotPassword, newPasswordSchema } from "@/server/services/users";
import { consumeChallenge } from "@/server/services/verification";
import { parseInput, z } from "@/server/validation/zod";

const schema = z.object({ token: z.string().min(10).max(200), code: z.string().max(20) });

/** Şifremi unuttum 2. adım: kod + yeni şifre. */
export const POST = apiRoute("public", async ({ req, ctx }) => {
  const body = await readJson(req);
  const data = parseInput(schema, body);
  const pw = parseInput(newPasswordSchema, body); // önce şifre kurallara uysun, kod boşa gitmesin
  const row = consumeChallenge(ctx, data.token, data.code, "forgot_password");
  const user = applyForgotPassword(ctx, row, pw.newPassword);
  return { ok: true, username: user.username };
});
