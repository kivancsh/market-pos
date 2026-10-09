import { apiRoute, readJson } from "@/server/http/api";
import { applyBulkPrice } from "@/server/services/bulkPrice";

export const POST = apiRoute(["owner"], async ({ req, ctx }) => applyBulkPrice(ctx, (await readJson(req)) as never));
