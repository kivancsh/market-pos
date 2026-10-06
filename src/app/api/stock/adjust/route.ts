import { apiRoute, readJson } from "@/server/http/api";
import { adjustStock } from "@/server/services/stock";

export const POST = apiRoute(["owner"], async ({ req, ctx }) => adjustStock(ctx, (await readJson(req)) as never));
