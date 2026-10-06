import { apiRoute, parseId, readJson } from "@/server/http/api";
import { voidSale } from "@/server/services/voids";

export const POST = apiRoute<{ id: string }>(["owner"], async ({ req, ctx, params }) => ({
  sale: voidSale(ctx, parseId(params.id), (await readJson(req)) as never),
}));
