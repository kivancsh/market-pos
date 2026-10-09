import type { Ctx } from "../context";
import type { DB } from "../db/types";
import { getProductById, setStockQty } from "../db/repositories/products";
import { insertMovement, type MovementType } from "../db/repositories/stockMovements";
import { notFound } from "../errors";
import { idSchema } from "../validation/common";
import { parseInput, z } from "../validation/zod";
import { audit } from "./audit";
import { stamp } from "./clock";

export interface StockChange {
  productId: number;
  qtyChange: number;
  type: MovementType;
  unitCostKurus: number | null;
  refType: string | null;
  refId: number | null;
  note: string | null;
}

/**
 * Stoğu değiştirir VE aynı anda stok hareketi yazar (değişmez kuralın tek giriş noktası).
 * Mutlaka bir transaction içinde çağrılmalı.
 */
export function applyStockChange(
  db: DB,
  time: { nowIso: string; businessDate: string },
  change: StockChange,
): { stockBefore: number; stockAfter: number } {
  const product = getProductById(db, change.productId);
  if (!product) throw notFound("PRODUCT_NOT_FOUND", "Ürün bulunamadı.", { productId: change.productId });
  const stockBefore = product.stockQty;
  const stockAfter = stockBefore + change.qtyChange;
  setStockQty(db, change.productId, stockAfter, time.nowIso);
  insertMovement(db, {
    productId: change.productId,
    type: change.type,
    qtyChange: change.qtyChange,
    stockAfter,
    unitCostKurus: change.unitCostKurus,
    refType: change.refType,
    refId: change.refId,
    note: change.note,
    createdAt: time.nowIso,
    businessDate: time.businessDate,
  });
  return { stockBefore, stockAfter };
}

export const adjustStockSchema = z.object({
  productId: idSchema,
  countedQty: z.int().min(0).max(1_000_000),
  note: z.string().trim().min(1, "Not zorunludur (fire, kırık, kayıp, sayım farkı...).").max(300),
});

export interface AdjustStockResult {
  productId: number;
  stockBefore: number;
  stockAfter: number;
  difference: number;
  changed: boolean;
}

/** Stok sayımı / düzeltme: sayılan adet ile sistemdeki fark 'adjustment' hareketi olarak yazılır. */
export function adjustStock(ctx: Ctx, input: z.input<typeof adjustStockSchema>): AdjustStockResult {
  const data = parseInput(adjustStockSchema, input);
  const time = stamp(ctx);
  return ctx.db
    .transaction((): AdjustStockResult => {
      const product = getProductById(ctx.db, data.productId);
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "Ürün bulunamadı.");
      const difference = data.countedQty - product.stockQty;
      if (difference === 0) {
        return {
          productId: product.id,
          stockBefore: product.stockQty,
          stockAfter: product.stockQty,
          difference: 0,
          changed: false,
        };
      }
      const r = applyStockChange(ctx.db, time, {
        productId: product.id,
        qtyChange: difference,
        type: "adjustment",
        unitCostKurus: product.avgCostKurus,
        refType: null,
        refId: null,
        note: data.note,
      });
      audit(ctx, "stock.adjust", `${product.name}: stok ${r.stockBefore} → ${r.stockAfter} (${data.note})`, {
        entityType: "product",
        entityId: product.id,
      });
      return { productId: product.id, ...r, difference, changed: true };
    })
    .immediate();
}

export const adjustStockBatchSchema = z.object({
  items: z.array(adjustStockSchema).min(1, "Listeye en az bir ürün ekleyin.").max(1000),
});

/**
 * Stok sayımı listesi: tüm satırlar TEK transaction'da uygulanır (biri hatalıysa hiçbiri yazılmaz).
 * Aynı ürün listede birden çok kez varsa son sayım geçerlidir.
 */
export function adjustStockBatch(ctx: Ctx, input: z.input<typeof adjustStockBatchSchema>): AdjustStockResult[] {
  const data = parseInput(adjustStockBatchSchema, input);
  const lastByProduct = new Map(data.items.map((i) => [i.productId, i]));
  return ctx.db
    .transaction(() => [...lastByProduct.values()].map((item) => adjustStock(ctx, item)))
    .immediate();
}
