import { apiRoute, readJson } from "@/server/http/api";
import { previewBulkPrice } from "@/server/services/bulkPrice";

export const POST = apiRoute(["owner"], async ({ req, ctx }) => previewBulkPrice(ctx, (await readJson(req)) as never));
