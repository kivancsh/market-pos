import { startSession } from "@/server/auth/startSession";
import { apiRoute, parseId, readJson } from "@/server/http/api";
import { applySecretChange, validateSecretChange } from "@/server/services/users";
import { consumeChallenge } from "@/server/services/verification";
import { parseInput, z } from "@/server/validation/zod";

const schema = z.object({ token: z.string().min(10).max(200), code: z.string().max(20) });

/** Şifre/PIN değiştirme 2. adım: kod + yeni şifre/PIN. Kendi şifresiyse bu cihazdaki oturum yenilenir. */
export const POST = apiRoute<{ id: string }>(["owner"], async ({ req, ctx, params, session }) => {
  const id = parseId(params.id);
  const body = await readJson(req);
  const data = parseInput(schema, body);
  const change = validateSecretChange(ctx, id, body);
  const row = consumeChallenge(ctx, data.token, data.code, "change_secret");
  const user = applySecretChange(ctx, row, id, change);
  if (id === ctx.actor?.userId) await startSession(session, user, ctx.now());
  return { user };
});
