import { apiRoute, readJson } from "@/server/http/api";
import { getMailStatus, saveMailSettings } from "@/server/mail";
import { audit } from "@/server/services/audit";
import { parseMailSettings } from "@/server/mail/schema";

export const GET = apiRoute(["owner"], ({ ctx }) => ({ mail: getMailStatus(ctx.db) }));

/** Gönderen e-posta hesabını değiştir (önce giriş denenir). */
export const PUT = apiRoute(["owner"], async ({ req, ctx }) => {
  const data = parseMailSettings(await readJson(req));
  const mail = await saveMailSettings(ctx.db, data);
  ctx.db.transaction(() => audit(ctx, "settings.update", `E-posta gönderim hesabı: ${mail.user} (${mail.provider})`)).immediate();
  return { mail };
});
