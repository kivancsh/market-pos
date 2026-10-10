import { startSession } from "@/server/auth/startSession";
import { apiRoute, parseId, readJson } from "@/server/http/api";
import { changeSecretDirect } from "@/server/services/users";

/**
 * E-posta bağlı değilken şifre/PIN değiştirme (kodsuz). E-posta kodu kullanılabiliyorsa 409 CODE_REQUIRED
 * (o zaman secret/start + secret/verify). Kendi şifresiyse mevcut şifre istenir ve bu cihazdaki oturum yenilenir.
 */
export const PUT = apiRoute<{ id: string }>(["owner"], async ({ req, ctx, params, session }) => {
  const id = parseId(params.id);
  const user = changeSecretDirect(ctx, id, await readJson(req));
  if (id === ctx.actor?.userId) await startSession(session, user, ctx.now());
  return { user };
});
