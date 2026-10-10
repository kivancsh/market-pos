import { apiRoute, readJson } from "@/server/http/api";
import { prepareForgotPassword } from "@/server/services/users";
import { sendChallenge } from "@/server/services/verification";
import { parseInput, z } from "@/server/validation/zod";

const schema = z.object({ username: z.string().trim().min(1, "Kullanıcı adınızı yazın.").max(64) });

/** Şifremi unuttum 1. adım: yöneticinin e-postasına kod. */
export const POST = apiRoute("public", async ({ req, ctx }) => {
  const { username } = parseInput(schema, await readJson(req));
  const f = prepareForgotPassword(ctx, username);
  return sendChallenge(ctx, { purpose: "forgot_password", email: f.email, userId: f.userId, action: f.action });
});
