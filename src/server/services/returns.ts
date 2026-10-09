import { incrementalShare } from "@/lib/pricing";
import type { Ctx } from "../context";
import { isDayClosed } from "../db/repositories/dayClosings";
import {
  getReturnById,
  insertReturn,
  insertReturnItem,
  listReturnItems,
  type Return,
  type ReturnItem,
} from "../db/repositories/returns";
import { addReturnedQty, getSaleById, getSaleItems } from "../db/repositories/sales";
import { conflict, notFound, unprocessable } from "../errors";
import { idSchema, optionalText, paymentMethodSchema, qtySchema } from "../validation/common";
import { parseInput, z } from "../validation/zod";
import { stamp } from "./clock";
import { applyStockChange } from "./stock";

export const createReturnSchema = z.object({
  saleId: idSchema,
  items: z.array(z.object({ saleItemId: idSchema, qty: qtySchema })).min(1, "İade edilecek ürün seçin."),
  refundMethod: paymentMethodSchema.nullish(),
  reason: optionalText(300),
});
export type CreateReturnInput = z.input<typeof createReturnSchema>;

export interface CreateReturnResult {
  return: Return;
  items: ReturnItem[];
}

/**
 * İade (kısmi veya tam). Tutarlar ORİJİNAL satıştaki snapshot değerlerden, birikimli oranla hesaplanır;
 * böylece parça parça iadelerin toplamı tam iadeye kuruşu kuruşuna eşit olur.
 * İade, yapıldığı iş gününün raporunda ciro ve kârdan düşülür.
 */
export function createReturn(ctx: Ctx, input: CreateReturnInput): CreateReturnResult {
  const data = parseInput(createReturnSchema, input);
  const time = stamp(ctx);
  const db = ctx.db;
  return db
    .transaction((): CreateReturnResult => {
      const sale = getSaleById(db, data.saleId);
      if (!sale) throw notFound("SALE_NOT_FOUND", "Satış bulunamadı.");
      if (sale.status === "voided") throw conflict("SALE_VOIDED", "İptal edilmiş satıştan iade yapılamaz.");
      if (isDayClosed(db, time.businessDate)) {
        throw conflict("DAY_CLOSED", "Gün kapatıldı. İade için önce günü yeniden açın.");
      }

      // Aynı kalem birden çok kez geldiyse birleştir
      const requested = new Map<number, number>();
      for (const i of data.items) requested.set(i.saleItemId, (requested.get(i.saleItemId) ?? 0) + i.qty);

      const saleItems = new Map(getSaleItems(db, sale.id).map((i) => [i.id, i]));
      const plan = [...requested].map(([saleItemId, qty]) => {
        const item = saleItems.get(saleItemId);
        if (!item) throw unprocessable("SALE_ITEM_NOT_FOUND", "İade edilen kalem bu satışa ait değil.");
        const returnable = item.qty - item.returnedQty;
        if (qty > returnable) {
          throw unprocessable(
            "RETURN_QTY_EXCEEDED",
            `"${item.productNameSnapshot}" için en fazla ${returnable} adet iade edilebilir.`,
            { saleItemId, returnable, requested: qty },
          );
        }
        const share = (amount: number) => incrementalShare(amount, item.qty, item.returnedQty, qty);
        const refundKurus = share(item.lineTotalKurus);
        const netKurus = share(item.lineNetKurus);
        const costKurus = share(item.lineCostKurus);
        const costNetKurus = share(item.lineCostNetKurus);
        return { item, qty, refundKurus, netKurus, costKurus, costNetKurus, profitReversalKurus: netKurus - costNetKurus };
      });

      const total = (f: (p: (typeof plan)[number]) => number) => plan.reduce((a, p) => a + f(p), 0);
      const returnId = insertReturn(db, {
        saleId: sale.id,
        createdAt: time.nowIso,
        businessDate: time.businessDate,
        refundTotalKurus: total((p) => p.refundKurus),
        netTotalKurus: total((p) => p.netKurus),
        costTotalKurus: total((p) => p.costKurus),
        costNetTotalKurus: total((p) => p.costNetKurus),
        profitReversalKurus: total((p) => p.profitReversalKurus),
        refundMethod: data.refundMethod ?? sale.paymentMethod,
        reason: data.reason,
      });

      for (const p of plan) {
        insertReturnItem(db, {
          returnId,
          saleItemId: p.item.id,
          qty: p.qty,
          refundKurus: p.refundKurus,
          netKurus: p.netKurus,
          costKurus: p.costKurus,
          costNetKurus: p.costNetKurus,
          profitReversalKurus: p.profitReversalKurus,
        });
        addReturnedQty(db, p.item.id, p.qty);
        applyStockChange(db, time, {
          productId: p.item.productId,
          qtyChange: p.qty,
          type: "return",
          unitCostKurus: p.item.unitCostKurus,
          refType: "return",
          refId: returnId,
          note: data.reason,
        });
      }
      return { return: getReturnById(db, returnId)!, items: listReturnItems(db, returnId) };
    })
    .immediate();
}
