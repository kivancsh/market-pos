import { apiRoute, readJson } from "@/server/http/api";
import { createProduct, toCatalogItem } from "@/server/services/products";

export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const product = createProduct(ctx, (await readJson(req)) as never);
  return { product, catalogItem: toCatalogItem(product) };
});
