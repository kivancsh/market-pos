import { apiRoute, readJson } from "@/server/http/api";
import { prepareSetup } from "@/server/services/users";
import { sendChallenge } from "@/server/services/verification";

/** Kurulum 2. adım: yönetici bilgileri → onay kodu e-postaya. */
export const POST = apiRoute("public", async ({ req, ctx }) => {
  const { email, payload } = prepareSetup(ctx, await readJson(req));
  return sendChallenge(ctx, { purpose: "setup", email, userId: null, payload, action: `Yönetici hesabı oluşturma (${payload.username})` });
});
