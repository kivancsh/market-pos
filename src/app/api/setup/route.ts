import { apiRoute, readJson } from "@/server/http/api";
import { createFirstOwner, hasOwner } from "@/server/services/users";
import { startSession } from "@/server/auth/startSession";

/** İlk kurulum durumu. */
export const GET = apiRoute("public", ({ ctx }) => ({ needsSetup: !hasOwner(ctx) }));

/** İlk yönetici hesabını oluşturur ve oturum açar (sadece hiç yönetici yokken). */
export const POST = apiRoute("public", async ({ req, ctx, session }) => {
  const user = createFirstOwner(ctx, (await readJson(req)) as never);
  await startSession(session, user, ctx.now());
  return { role: user.role, name: user.name };
});
