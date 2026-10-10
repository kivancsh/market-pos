import { getUserById } from "@/server/db/repositories/users";
import { badRequest } from "@/server/errors";
import { apiRoute } from "@/server/http/api";
import { maskEmail, sendMail } from "@/server/mail";
import { layout } from "@/server/mail/templates";
import { getSettings } from "@/server/db/repositories/settings";

/** Deneme e-postası: işlemi yapan yöneticinin adresine. */
export const POST = apiRoute(["owner"], async ({ ctx }) => {
  const me = ctx.actor?.userId ? getUserById(ctx.db, ctx.actor.userId) : undefined;
  if (!me?.email) throw badRequest("EMAIL_REQUIRED", "Önce Hesabım'dan e-posta adresinizi ekleyin.");
  const businessName = getSettings(ctx.db).businessName;
  await sendMail(ctx.db, {
    to: me.email,
    subject: "Market Kasa deneme e-postası",
    text: "E-posta gönderimi çalışıyor. Onay kodları ve günlük rapor bu adrese gelecek.",
    html: layout("E-posta gönderimi çalışıyor", "<p>Onay kodları ve günlük rapor bu adrese gelecek.</p>", businessName),
  });
  return { ok: true, to: maskEmail(me.email) };
});
