import { addDays, getBusinessDate } from "@/lib/businessDate";
import { getProductDailySales } from "@/server/db/repositories/stats";
import { listMovementsByProduct } from "@/server/db/repositories/stockMovements";
import { notFound } from "@/server/errors";
import { apiRoute, parseId, readJson } from "@/server/http/api";
import { getProductWithBarcodes, updateProduct } from "@/server/services/products";

const SALES_CHART_DAYS = 30;

/** Ürün detayı: barkodlar, stok hareketleri ve son 30 günün günlük satışları (boş günler 0). */
export const GET = apiRoute<{ id: string }>(["owner"], ({ ctx, params }) => {
  const product = getProductWithBarcodes(ctx, parseId(params.id));
  if (!product) throw notFound("PRODUCT_NOT_FOUND", "Ürün bulunamadı.");
  const to = getBusinessDate(ctx.now());
  const from = addDays(to, -(SALES_CHART_DAYS - 1));
  const rows = new Map(getProductDailySales(ctx.db, product.id, from, to).map((r) => [r.businessDate, r]));
  const sales = Array.from({ length: SALES_CHART_DAYS }, (_, i) => {
    const d = addDays(from, i);
    return { businessDate: d, qty: rows.get(d)?.qty ?? 0, revenueKurus: rows.get(d)?.revenueKurus ?? 0 };
  });
  return { product, movements: listMovementsByProduct(ctx.db, product.id, 300), sales };
});

export const PATCH = apiRoute<{ id: string }>(["owner"], async ({ req, ctx, params }) => ({
  product: updateProduct(ctx, parseId(params.id), (await readJson(req)) as never),
}));
