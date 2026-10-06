import { weightedAverageCost } from "@/lib/pricing";
import type { Ctx } from "../context";
import { getProductById, setAvgCost } from "../db/repositories/products";
import { insertPurchase, insertPurchaseItem } from "../db/repositories/purchases";
import { notFound, unprocessable } from "../errors";
import { idSchema, kurusSchema, optionalText, qtySchema } from "../validation/common";
import { parseInput, z } from "../validation/zod";
import { stamp } from "./clock";
import { applyStockChange } from "./stock";

export const createPurchaseSchema = z.object({
  supplier: optionalText(120),
  invoiceNo: optionalText(60),
  note: optionalText(300),
  items: z
    .array(z.object({ productId: idSchema, qty: qtySchema, unitCostKurus: kurusSchema }))
    .min(1, "En az bir ürün ekleyin.")
    .max(500),
});
export type CreatePurchaseInput = z.input<typeof createPurchaseSchema>;

export interface PurchaseResult {
  purchaseId: number;
  totalCostKurus: number;
  products: { productId: number; name: string; stockAfter: number; avgCostKurus: number }[];
}

/**
 * Mal girişi: her kalem için ağırlıklı ortalama maliyet güncellenir, stok artar,
 * 'purchase' hareketi yazılır. Hepsi tek transaction'da.
 */
export function createPurchase(ctx: Ctx, input: CreatePurchaseInput): PurchaseResult {
  const data = parseInput(createPurchaseSchema, input);
  const time = stamp(ctx);
  const db = ctx.db;
  return db
    .transaction((): PurchaseResult => {
      const totalCostKurus = data.items.reduce((a, i) => a + i.qty * i.unitCostKurus, 0);
      if (!Number.isSafeInteger(totalCostKurus)) throw unprocessable("AMOUNT_TOO_LARGE", "Tutar çok büyük.");
      const purchaseId = insertPurchase(db, {
        supplier: data.supplier,
        invoiceNo: data.invoiceNo,
        note: data.note,
        createdAt: time.nowIso,
        businessDate: time.businessDate,
        totalCostKurus,
      });
      const touched = new Map<number, PurchaseResult["products"][number]>();
      for (const item of data.items) {
        const product = getProductById(db, item.productId);
        if (!product) throw notFound("PRODUCT_NOT_FOUND", "Ürün bulunamadı.", { productId: item.productId });
        if (!product.isActive) {
          throw unprocessable("PRODUCT_INACTIVE", `"${product.name}" pasif. Önce ürünü aktif yapın.`);
        }
        const newAvg = weightedAverageCost(product.stockQty, product.avgCostKurus, item.qty, item.unitCostKurus);
        insertPurchaseItem(db, { purchaseId, ...item });
        setAvgCost(db, product.id, newAvg, time.nowIso);
        const { stockAfter } = applyStockChange(db, time, {
          productId: product.id,
          qtyChange: item.qty,
          type: "purchase",
          unitCostKurus: item.unitCostKurus,
          refType: "purchase",
          refId: purchaseId,
          note: null,
        });
        touched.set(product.id, { productId: product.id, name: product.name, stockAfter, avgCostKurus: newAvg });
      }
      return { purchaseId, totalCostKurus, products: [...touched.values()] };
    })
    .immediate();
}
