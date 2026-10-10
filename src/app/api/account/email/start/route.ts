import { apiRoute, readJson } from "@/server/http/api";
import { prepareEmailChange } from "@/server/services/users";
import { sendChallenge } from "@/server/services/verification";

/** E-posta ekleme/değiştirme 1. adım: kod YENİ adrese. */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const p = prepareEmailChange(ctx, await readJson(req));
  return sendChallenge(ctx, { purpose: "change_email", email: p.email, userId: p.userId, payload: p.payload, action: p.action });
});
