import { compactDate } from "@/lib/businessDate";
import { computeLine, distributeDiscount, resolveCartDiscount, type CartDiscount } from "@/lib/pricing";
import type { Ctx } from "../context";
import { isDayClosed } from "../db/repositories/dayClosings";
import { getProductById, type Product } from "../db/repositories/products";
import {
  getSaleByClientRequestId,
  getSaleById,
  getSaleItems,
  insertSale,
  insertSaleItem,
  nextReceiptSeq,
  type Role,
  type Sale,
  type SaleItem,
} from "../db/repositories/sales";
import { getSettings } from "../db/repositories/settings";
import { conflict, forbidden, notFound, unprocessable } from "../errors";
import { idSchema, kurusSchema, paymentMethodSchema, qtySchema } from "../validation/common";
import { parseInput, z } from "../validation/zod";
import { stamp } from "./clock";
import type { OkcSaleStatus } from "@/lib/okc";
import { enqueueSaleForOkc, findSaleOkcStatus } from "./okc";
import { applyStockChange } from "./stock";

export const completeSaleSchema = z
  .object({
    clientRequestId: z.uuid(),
    items: z
      .array(
        z.object({
          productId: idSchema,
          qty: qtySchema,
          barcode: z.string().trim().max(64).nullish(),
        }),
      )
      .min(1, "Sepet boş.")
      .max(500),
    cartDiscount: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("amount"), value: kurusSchema }),
        z.object({ type: z.literal("percent"), value: z.int().min(0).max(100) }),
      ])
      .nullish(),
    paymentMethod: paymentMethodSchema,
    cashReceivedKurus: kurusSchema.nullish(),
  })
  .strict();
export type CompleteSaleInput = z.input<typeof completeSaleSchema>;

export interface Actor {
  role: Role;
  userId?: number | null;
  name?: string | null;
}

export interface StockShortage {
  productId: number;
  name: string;
  requested: number;
  available: number;
  missing: number;
}

export interface LowStockItem {
  productId: number;
  name: string;
  stockQty: number;
  minStock: number;
}

export interface CompleteSaleResult {
  sale: Sale;
  items: SaleItem[];
  /** true: aynı clientRequestId ile daha önce kaydedilmiş satış döndürüldü (yeni kayıt yok). */
  duplicate: boolean;
  /** Bu satışla kritik stoğa (stok <= min) düşen ürünler. */
  lowStock: LowStockItem[];
  /** allow_negative_stock açıkken yetersiz stokla yapılan satışlar için uyarı. */
  warnings: { code: "NEGATIVE_STOCK"; message: string; shortages: StockShortage[] }[];
  /** Yazar kasa bağlıysa satışın yasal fiş durumu (fiş kesilene kadar kasa ekranı bekler); bağlı değilse null. */
  okc: OkcSaleStatus | null;
}

interface MergedLine {
  product: Product;
  qty: number;
  barcode: string | null;
}

/**
 * Satışı tamamlar. Her şey TEK transaction içinde yapılır; herhangi bir hata olursa hiçbir şey yazılmaz.
 * Fiyat, maliyet ve KDV istemciden ASLA alınmaz; veritabanından okunur.
 */
export function completeSale(ctx: Ctx, input: CompleteSaleInput, actor: Actor): CompleteSaleResult {
  const data = parseInput(completeSaleSchema, input);
  const time = stamp(ctx);
  const db = ctx.db;

  return db
    .transaction((): CompleteSaleResult => {
      // 1. Çift kayıt koruması
      const existing = getSaleByClientRequestId(db, data.clientRequestId);
      if (existing) {
        return {
          sale: existing,
          items: getSaleItems(db, existing.id),
          duplicate: true,
          lowStock: [],
          warnings: [],
          okc: findSaleOkcStatus(db, existing.id),
        };
      }

      // 2. Gün kapalı mı?
      if (isDayClosed(db, time.businessDate)) {
        throw conflict("DAY_CLOSED", "Gün kapatıldı. Yeni satış için günü yeniden açın.");
      }

      const settings = getSettings(db);

      // 3. Aynı ürünün satırlarını birleştir (ilk görülme sırası korunur)
      const merged = new Map<number, { qty: number; barcode: string | null }>();
      for (const item of data.items) {
        const m = merged.get(item.productId);
        if (m) {
          m.qty += item.qty;
          m.barcode ??= item.barcode || null;
        } else {
          merged.set(item.productId, { qty: item.qty, barcode: item.barcode || null });
        }
      }

      // 4. Ürünleri veritabanından oku
      const lines: MergedLine[] = [];
      const missing: number[] = [];
      const inactive: { productId: number; name: string }[] = [];
      for (const [productId, m] of merged) {
        const product = getProductById(db, productId);
        if (!product) missing.push(productId);
        else if (!product.isActive) inactive.push({ productId, name: product.name });
        else lines.push({ product, qty: m.qty, barcode: m.barcode });
      }
      if (missing.length > 0) {
        throw notFound("PRODUCT_NOT_FOUND", "Sepetteki bazı ürünler bulunamadı. Sayfayı yenileyin.", {
          productIds: missing,
        });
      }
      if (inactive.length > 0) {
        throw unprocessable(
          "PRODUCT_INACTIVE",
          `Satışa kapalı ürün var: ${inactive.map((i) => i.name).join(", ")}`,
          { products: inactive },
        );
      }

      // 5. Stok kontrolü
      const shortages: StockShortage[] = lines
        .filter((l) => l.product.stockQty < l.qty)
        .map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          requested: l.qty,
          available: l.product.stockQty,
          missing: l.qty - Math.max(l.product.stockQty, 0),
        }));
      const warnings: CompleteSaleResult["warnings"] = [];
      if (shortages.length > 0) {
        if (!settings.allowNegativeStock) {
          throw conflict(
            "INSUFFICIENT_STOCK",
            `Yetersiz stok: ${shortages.map((s) => `${s.name} (stok ${s.available}, istenen ${s.requested})`).join("; ")}`,
            { shortages },
          );
        }
        warnings.push({ code: "NEGATIVE_STOCK", message: "Bazı ürünlerin stoğu eksiye düştü.", shortages });
      }

      // 6. İndirim ve satır hesapları
      const discount: CartDiscount | null =
        data.cartDiscount && data.cartDiscount.value > 0 ? data.cartDiscount : null;
      if (discount && actor.role === "cashier" && !settings.cashierCanDiscount) {
        throw forbidden("DISCOUNT_NOT_ALLOWED", "Kasiyer indirim yapamaz. Yöneticiye başvurun.");
      }
      const grosses = lines.map((l) => l.product.salePriceKurus * l.qty);
      const subtotalKurus = grosses.reduce((a, b) => a + b, 0);
      let discountKurus: number;
      try {
        discountKurus = resolveCartDiscount(subtotalKurus, discount);
      } catch {
        throw unprocessable("DISCOUNT_TOO_LARGE", "İndirim ara toplamdan büyük olamaz.");
      }
      const lineDiscounts = distributeDiscount(grosses, discountKurus);
      const computed = lines.map((l, i) => ({
        line: l,
        amounts: computeLine({
          unitPriceKurus: l.product.salePriceKurus,
          unitCostKurus: l.product.avgCostKurus,
          qty: l.qty,
          vatRate: l.product.vatRate,
          lineDiscountKurus: lineDiscounts[i]!,
        }),
      }));
      const sum = (f: (a: (typeof computed)[number]["amounts"]) => number) =>
        computed.reduce((acc, c) => acc + f(c.amounts), 0);
      const totalKurus = sum((a) => a.lineTotalKurus);
      const netTotalKurus = sum((a) => a.lineNetKurus);
      const vatTotalKurus = sum((a) => a.lineVatKurus);
      const costTotalKurus = sum((a) => a.lineCostKurus);
      const costNetTotalKurus = sum((a) => a.lineCostNetKurus);
      const grossProfitKurus = sum((a) => a.lineProfitKurus);

      // 7. Ödeme
      let cashReceivedKurus: number | null = null;
      let changeKurus: number | null = null;
      if (data.paymentMethod === "cash") {
        cashReceivedKurus = data.cashReceivedKurus ?? totalKurus;
        if (cashReceivedKurus < totalKurus) {
          throw unprocessable("INSUFFICIENT_CASH", "Alınan para toplam tutardan az.", {
            totalKurus,
            cashReceivedKurus,
          });
        }
        changeKurus = cashReceivedKurus - totalKurus;
      }

      // 8. Kayıtlar
      const seq = nextReceiptSeq(db, time.businessDate);
      const receiptNo = `${compactDate(time.businessDate)}-${String(seq).padStart(4, "0")}`;
      const saleId = insertSale(db, {
        receiptNo,
        clientRequestId: data.clientRequestId,
        createdAt: time.nowIso,
        businessDate: time.businessDate,
        paymentMethod: data.paymentMethod,
        subtotalKurus,
        discountKurus,
        totalKurus,
        netTotalKurus,
        vatTotalKurus,
        costTotalKurus,
        costNetTotalKurus,
        grossProfitKurus,
        cashReceivedKurus,
        changeKurus,
        createdByRole: actor.role,
        userId: actor.userId ?? ctx.actor?.userId ?? null,
        userName: actor.name ?? ctx.actor?.name ?? null,
      });

      const lowStock: LowStockItem[] = [];
      for (const { line, amounts } of computed) {
        insertSaleItem(db, {
          saleId,
          productId: line.product.id,
          productNameSnapshot: line.product.name,
          barcodeSnapshot: line.barcode,
          qty: line.qty,
          unitPriceKurus: line.product.salePriceKurus,
          unitCostKurus: line.product.avgCostKurus,
          vatRate: line.product.vatRate,
          lineDiscountKurus: amounts.lineDiscountKurus,
          lineTotalKurus: amounts.lineTotalKurus,
          lineNetKurus: amounts.lineNetKurus,
          lineVatKurus: amounts.lineVatKurus,
          lineCostKurus: amounts.lineCostKurus,
          lineCostNetKurus: amounts.lineCostNetKurus,
          lineProfitKurus: amounts.lineProfitKurus,
        });
        const { stockAfter } = applyStockChange(db, time, {
          productId: line.product.id,
          qtyChange: -line.qty,
          type: "sale",
          unitCostKurus: line.product.avgCostKurus,
          refType: "sale",
          refId: saleId,
          note: null,
        });
        if (stockAfter <= line.product.minStock) {
          lowStock.push({
            productId: line.product.id,
            name: line.product.name,
            stockQty: stockAfter,
            minStock: line.product.minStock,
          });
        }
      }

      // 9. Yazar kasa bağlıysa yasal fiş için kuyruğa al (aynı transaction: satış varsa kuyruk kaydı da vardır)
      const okc = enqueueSaleForOkc(db, saleId, time.nowIso);

      return { sale: getSaleById(db, saleId)!, items: getSaleItems(db, saleId), duplicate: false, lowStock, warnings, okc };
    })
    .immediate();
}
