import type { Ctx } from "../context";
import { isDayClosed } from "../db/repositories/dayClosings";
import { countReturnsForSale } from "../db/repositories/returns";
import { getSaleById, getSaleItems, markSaleVoided, type Sale } from "../db/repositories/sales";
import { conflict, notFound } from "../errors";
import { parseInput, z } from "../validation/zod";
import { stamp } from "./clock";
import { applyStockChange } from "./stock";

export const voidSaleSchema = z.object({
  reason: z.string().trim().min(3, "İptal gerekçesi zorunludur (en az 3 karakter).").max(300),
});

/**
 * Satış iptali: sadece aynı iş günü, gün kapatılmamışsa ve satıştan iade yapılmamışsa.
 * Stoklar 'void' hareketiyle geri eklenir; iptal edilen satış raporlara girmez.
 */
export function voidSale(ctx: Ctx, saleId: number, input: z.input<typeof voidSaleSchema>): Sale {
  const data = parseInput(voidSaleSchema, input);
  const time = stamp(ctx);
  const db = ctx.db;
  return db
    .transaction((): Sale => {
      const sale = getSaleById(db, saleId);
      if (!sale) throw notFound("SALE_NOT_FOUND", "Satış bulunamadı.");
      if (sale.status === "voided") throw conflict("ALREADY_VOIDED", "Bu satış zaten iptal edilmiş.");
      if (sale.businessDate !== time.businessDate) {
        throw conflict(
          "VOID_ONLY_SAME_DAY",
          "Sadece bugünkü satışlar iptal edilebilir. Geçmiş satışlar için iade yapın.",
        );
      }
      if (isDayClosed(db, sale.businessDate)) {
        throw conflict("DAY_CLOSED", "Gün kapatıldı. İptal için önce günü yeniden açın.");
      }
      if (countReturnsForSale(db, sale.id) > 0) {
        throw conflict("SALE_HAS_RETURNS", "Bu satıştan iade yapılmış; iptal edilemez.");
      }
      for (const item of getSaleItems(db, sale.id)) {
        applyStockChange(db, time, {
          productId: item.productId,
          qtyChange: item.qty,
          type: "void",
          unitCostKurus: item.unitCostKurus,
          refType: "sale",
          refId: sale.id,
          note: data.reason,
        });
      }
      markSaleVoided(db, sale.id, time.nowIso, data.reason);
      return getSaleById(db, sale.id)!;
    })
    .immediate();
}
