import { apiRoute, readJson } from "@/server/http/api";
import { adjustStock, adjustStockBatch } from "@/server/services/stock";

/** Tek ürün ({productId, countedQty, note}) veya sayım listesi ({items: [...]}, tek transaction). */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const body = (await readJson(req)) as { items?: unknown };
  if (body && typeof body === "object" && "items" in body) return { results: adjustStockBatch(ctx, body as never) };
  return adjustStock(ctx, body as never);
});
