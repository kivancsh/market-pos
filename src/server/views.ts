/**
 * API yanıtları için görünümler. Kasiyere giden yanıtlarda maliyet ve kâr alanları HİÇ bulunmaz;
 * bu yüzden kasiyer görünümleri izin listesi (whitelist) ile oluşturulur.
 */
import type { Role, Sale, SaleItem } from "./db/repositories/sales";
import type { CompleteSaleResult } from "./services/sales";

export function cashierSaleView(s: Sale) {
  return {
    id: s.id,
    receiptNo: s.receiptNo,
    createdAt: s.createdAt,
    businessDate: s.businessDate,
    status: s.status,
    paymentMethod: s.paymentMethod,
    subtotalKurus: s.subtotalKurus,
    discountKurus: s.discountKurus,
    totalKurus: s.totalKurus,
    netTotalKurus: s.netTotalKurus,
    vatTotalKurus: s.vatTotalKurus,
    cashReceivedKurus: s.cashReceivedKurus,
    changeKurus: s.changeKurus,
    userName: s.userName,
  };
}

export function cashierSaleItemView(i: SaleItem) {
  return {
    id: i.id,
    productId: i.productId,
    productNameSnapshot: i.productNameSnapshot,
    barcodeSnapshot: i.barcodeSnapshot,
    qty: i.qty,
    unitPriceKurus: i.unitPriceKurus,
    vatRate: i.vatRate,
    lineDiscountKurus: i.lineDiscountKurus,
    lineTotalKurus: i.lineTotalKurus,
    returnedQty: i.returnedQty,
  };
}

export function saleResultView(r: CompleteSaleResult, role: Role) {
  if (role === "owner") return r;
  return {
    sale: cashierSaleView(r.sale),
    items: r.items.map(cashierSaleItemView),
    duplicate: r.duplicate,
    lowStock: r.lowStock,
    warnings: r.warnings,
    okc: r.okc,
  };
}
