import { listCategories } from "@/server/db/repositories/categories";
import { apiRoute, readJson } from "@/server/http/api";
import { createProduct, listProductsWithBarcodes, toCatalogItem } from "@/server/services/products";

/** Yönetici ürün listesi (pasifler dahil, maliyetle). */
export const GET = apiRoute(["owner"], ({ ctx }) => ({
  items: listProductsWithBarcodes(ctx),
  categories: listCategories(ctx.db),
}));

export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const product = createProduct(ctx, (await readJson(req)) as never);
  return { product, catalogItem: toCatalogItem(product) };
});
