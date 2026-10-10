import { apiRoute, parseId } from "@/server/http/api";
import { prepareSecretChange } from "@/server/services/users";
import { sendChallenge } from "@/server/services/verification";

/** Şifre/PIN değiştirme 1. adım: işlemi yapan yöneticinin e-postasına kod. */
export const POST = apiRoute<{ id: string }>(["owner"], async ({ ctx, params }) => {
  const p = prepareSecretChange(ctx, parseId(params.id));
  return sendChallenge(ctx, { purpose: "change_secret", email: p.email, userId: p.userId, payload: p.payload, action: p.action });
});
