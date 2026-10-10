import { apiRoute, readJson } from "@/server/http/api";
import { confirmServiceVerification } from "@/server/mail";
import { audit } from "@/server/services/audit";
import { emailSchema, setVerifiedOwnEmail } from "@/server/services/users";
import { parseInput, z } from "@/server/validation/zod";

/**
 * "E-posta bağla" (merkezi servis) 2. adım: kod doğruysa e-posta gönderimi servise bağlanır ve
 * bu adres yöneticinin e-postası olur (gün sonu raporu ve kodlar buraya gelir).
 */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const data = parseInput(z.object({ email: emailSchema, code: z.string().max(20) }), await readJson(req));
  const mail = await confirmServiceVerification(ctx.db, data.email, data.code, true);
  const user = setVerifiedOwnEmail(ctx, data.email);
  ctx.db.transaction(() => audit(ctx, "settings.update", `E-posta gönderimi Market Kasa e-posta servisine bağlandı (${data.email})`)).immediate();
  return { mail, user };
});
