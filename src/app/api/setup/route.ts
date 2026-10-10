import { startSession } from "@/server/auth/startSession";
import { apiRoute, readJson } from "@/server/http/api";
import { hasOwner, setupOwner } from "@/server/services/users";

/** İlk kurulum durumu: yönetici var mı. */
export const GET = apiRoute("public", ({ ctx }) => ({ needsSetup: !hasOwner(ctx) }));

/** İlk kurulum (tek adım): ilk yönetici hesabı oluşur ve oturum açılır. Sadece hiç yönetici yokken çalışır. */
export const POST = apiRoute("public", async ({ req, ctx, session }) => {
  const user = setupOwner(ctx, await readJson(req));
  await startSession(session, user, ctx.now());
  return { role: user.role, name: user.name };
});
