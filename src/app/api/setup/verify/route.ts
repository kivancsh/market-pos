import { startSession } from "@/server/auth/startSession";
import { apiRoute, readJson } from "@/server/http/api";
import { completeSetup } from "@/server/services/users";
import { consumeChallenge } from "@/server/services/verification";
import { parseInput, z } from "@/server/validation/zod";

const schema = z.object({ token: z.string().min(10).max(200), code: z.string().max(20) });

/** Kurulum 3. adım: e-postadaki kod doğru → yönetici hesabı oluşur ve oturum açılır. */
export const POST = apiRoute("public", async ({ req, ctx, session }) => {
  const data = parseInput(schema, await readJson(req));
  const row = consumeChallenge(ctx, data.token, data.code, "setup");
  const user = completeSetup(ctx, row);
  await startSession(session, user, ctx.now());
  return { role: user.role, name: user.name };
});
