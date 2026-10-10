import { apiRoute } from "@/server/http/api";
import { getMailStatus } from "@/server/mail";
import { hasOwner } from "@/server/services/users";

/** İlk kurulum durumu: yönetici var mı, e-posta gönderimi ayarlı mı. */
export const GET = apiRoute("public", ({ ctx }) => {
  const needsSetup = !hasOwner(ctx);
  const mail = getMailStatus(ctx.db);
  return { needsSetup, mail: needsSetup ? { configured: mail.configured, provider: mail.provider, user: mail.user } : undefined };
});
