import { apiRoute } from "@/server/http/api";
import { audit } from "@/server/services/audit";

export const POST = apiRoute("public", ({ session, ctx, user }) => {
  if (user) ctx.db.transaction(() => audit(ctx, "auth.logout", `${user.name} çıkış yaptı`)).immediate();
  session.destroy();
  return { ok: true };
});
