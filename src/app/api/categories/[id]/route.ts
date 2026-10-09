import { apiRoute, parseId, readJson } from "@/server/http/api";
import { removeCategory, updateCategory } from "@/server/services/categories";

export const PATCH = apiRoute<{ id: string }>(["owner"], async ({ req, ctx, params }) => ({
  category: updateCategory(ctx, parseId(params.id), (await readJson(req)) as never),
}));

export const DELETE = apiRoute<{ id: string }>(["owner"], ({ ctx, params }) => {
  removeCategory(ctx, parseId(params.id));
  return { ok: true };
});
