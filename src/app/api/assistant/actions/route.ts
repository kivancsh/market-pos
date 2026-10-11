import { apiRoute, readJson } from "@/server/http/api";
import { setPlanActionStatus } from "@/server/services/assistant";

/** Aksiyonu "yapıldı" / "atlandı" / "yapılacak" olarak işaretler. */
export const PUT = apiRoute(["owner"], async ({ req, ctx }) => ({ plan: setPlanActionStatus(ctx, await readJson(req)) }));
