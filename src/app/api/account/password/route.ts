import { apiRoute, readJson } from "@/server/http/api";
import { changeOwnPassword } from "@/server/services/users";
import { startSession } from "@/server/auth/startSession";

/** Yöneticinin kendi şifresini değiştirmesi; bu cihazdaki oturum yeni şifreyle devam eder, diğerleri kapanır. */
export const POST = apiRoute(["owner"], async ({ req, ctx, session }) => {
  const user = changeOwnPassword(ctx, (await readJson(req)) as never);
  await startSession(session, user, ctx.now());
  return { ok: true };
});
