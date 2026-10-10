import { forbidden } from "@/server/errors";
import { apiRoute, readJson } from "@/server/http/api";
import { saveMailSettings } from "@/server/mail";
import { parseMailSettings } from "@/server/mail/schema";
import { hasOwner } from "@/server/services/users";

/** Kurulum 1. adım: e-posta gönderim hesabını bağla (sadece henüz yönetici yokken; sonra Ayarlar'dan). */
export const POST = apiRoute("public", async ({ req, ctx }) => {
  if (hasOwner(ctx)) throw forbidden("ALREADY_SET_UP", "Kurulum zaten yapılmış. E-posta ayarları Ayarlar ekranındadır.");
  const data = parseMailSettings(await readJson(req));
  const status = await saveMailSettings(ctx.db, data);
  return { mail: { configured: status.configured, provider: status.provider, user: status.user } };
});
