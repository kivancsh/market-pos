/**
 * Hugin Cloud Link protokolü (yazar kasa → program).
 * Kaynak: Hugin'in herkese açık demo sunucusu (github.com/huginsdk/cls-demo, MIT) ve FPU teknik dokümanı
 * (github.com/huginsdk/fpu wiki). Akış:
 *   GET  /hugin/v1/orders               → cihaz açık siparişleri (satışları) listeler
 *   GET  /hugin/v1/orders/{id}          → cihaz siparişin kalemlerini alır, fişi açar, ödemeyi kendisi alır
 *   POST /hugin/v1/orders/{id}/result   → cihaz siparişle ilgili hata (ya da başarı) bildirir
 *   POST /hugin/v1/sales                → cihaz tamamlanan satışı (mali fiş) bildirir
 * Kimlik doğrulama: her istekte "X-ApiKey" başlığı (Ayarlar'da üretilen şifre; Hugin'e bildirilir).
 *
 * NOT: Hugin'in tam alan listesi (Postman koleksiyonu) entegratöre verilir; demo örneklerinde olmayan değerler
 * (belge türü, cihazın gönderdiği fiş/Z numarası alanlarının adı) Hugin ile yapılacak testte doğrulanmalıdır.
 * Bu yüzden belge türü tek yerde (HUGIN_DOCUMENT_TYPE) tanımlı ve gelen satış kaydı ham olarak saklanır.
 */
import { compactDate } from "@/lib/businessDate";
import { decimalToKurus, kurusToDecimalString } from "@/lib/okc";
import type { Sale, SaleItem } from "../db/repositories/sales";

/** Perakende fiş. Demo örneklerinde yalnız "E_INVOICE" geçiyor; fiş için değer Hugin testinde doğrulanmalı. */
export const HUGIN_DOCUMENT_TYPE = "RECEIPT";

/** Ürün adı fişte en fazla 20 karakter (Hugin JSONItem.Name sınırı). */
export function huginItemName(name: string): string {
  return name.toLocaleUpperCase("tr").replace(/\s+/g, " ").trim().slice(0, 20);
}

export function huginOrderSummary(orderId: string, sale: Sale) {
  return { orderId, orderTitle: `Fiş ${sale.receiptNo}`, amount: kurusToDecimalString(sale.totalKurus) };
}

/**
 * Satışın yazar kasaya gidecek hali. Fiyatlar programdaki satış anı değerleridir (snapshot); sepet indirimi
 * satırlara zaten dağıtılmış olduğu için her satırın tutarı indirimli tutardır ve toplam kuruşu kuruşuna aynıdır.
 */
export function huginOrderDetail(sale: Sale, items: SaleItem[], footer: string[]) {
  const discounted = items.some((i) => i.lineDiscountKurus > 0);
  return {
    orderName: `Fiş ${sale.receiptNo}`,
    documentType: HUGIN_DOCUMENT_TYPE,
    documentTitle: sale.receiptNo,
    documentDate: compactDate(sale.businessDate),
    isWaybill: "false",
    items: items.map((i) => ({
      name: huginItemName(i.productNameSnapshot),
      quantity: i.qty,
      unit: "AD",
      unitPrice: kurusToDecimalString(i.unitPriceKurus),
      amount: kurusToDecimalString(i.lineTotalKurus),
      vatRate: i.vatRate,
      barcode: i.barcodeSnapshot ?? "",
      referenceCode: String(i.productId),
      discount: {
        rate: 0,
        code: "",
        note: i.lineDiscountKurus > 0 ? `İNDİRİM ${kurusToDecimalString(i.lineDiscountKurus)} TL` : "",
      },
      salesPerson: 0,
      itemNotes: [],
    })),
    allowedPaymentTypes: sale.paymentMethod === "cash" ? ["CASH"] : ["EFT_POS.ICC", "EFT_POS.NFC"],
    checkDiscountOnPaymentAttempt: [],
    totals: { documentTotal: kurusToDecimalString(sale.totalKurus) },
    footerNotes: [...(discounted ? [`TOPLAM İNDİRİM: ${kurusToDecimalString(sale.discountKurus)} TL`] : []), ...footer],
  };
}

type Json = Record<string, unknown>;

function findKey(obj: unknown, names: string[], depth = 0): string | null {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  const lower = names.map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(obj as Json)) {
    if (lower.includes(k.toLowerCase()) && (typeof v === "string" || typeof v === "number") && String(v).trim() !== "") {
      return String(v).trim().slice(0, 64);
    }
  }
  for (const v of Object.values(obj as Json)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = findKey(v, names, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** Cihazın gönderdiği satış kaydından eşleştirme ve mali fiş bilgileri. Alan adları cihaza göre değişebilir. */
export function parseHuginSale(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Json;
  const totals = (b.totals && typeof b.totals === "object" ? b.totals : {}) as Json;
  return {
    orderId: findKey(b, ["orderId", "orderID", "order_id"]),
    documentTitle: typeof b.documentTitle === "string" ? b.documentTitle.trim() : null,
    orderName: typeof b.orderName === "string" ? b.orderName.trim() : null,
    totalKurus: decimalToKurus(totals.documentTotal ?? totals.netTotal ?? null),
    documentNo: findKey(b, ["receiptNo", "fiscalReceiptNo", "documentNo", "documentNumber", "ficheNo", "fisNo"]),
    zNo: findKey(b, ["zNo", "zNumber", "zReportNo", "zReportNumber"]),
  };
}

/** Siparişin sonucu: Hugin hata kodları "ERR_" ile başlar; başarı kodlarını da kabul ederiz. */
export function parseHuginResult(body: unknown): { ok: boolean; code: string; message: string } {
  const b = (body && typeof body === "object" ? body : {}) as Json;
  const code = typeof b.code === "string" ? b.code.trim().slice(0, 64) : "";
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 200) : "";
  const description = typeof b.description === "string" ? b.description.trim().slice(0, 500) : "";
  const ok = /^(SUCCESS|OK|0+)$/i.test(code);
  const message = [title, description].filter(Boolean).join(": ") || (ok ? "Tamamlandı" : "Yazar kasa siparişi tamamlayamadı.");
  return { ok, code: code || (ok ? "OK" : "ERR_UNKNOWN"), message };
}
