import { apiRoute, readJson } from "@/server/http/api";
import { createPurchase } from "@/server/services/purchases";

export const POST = apiRoute(["owner"], async ({ req, ctx }) => createPurchase(ctx, (await readJson(req)) as never));
