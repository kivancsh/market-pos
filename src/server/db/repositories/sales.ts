import type { DB } from "../types";

export type PaymentMethod = "cash" | "card";
export type Role = "owner" | "cashier";
export type SaleStatus = "completed" | "voided";

export interface Sale {
  id: number;
  receiptNo: string;
  clientRequestId: string;
  createdAt: string;
  businessDate: string;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  subtotalKurus: number;
  discountKurus: number;
  totalKurus: number;
  netTotalKurus: number;
  vatTotalKurus: number;
  costTotalKurus: number;
  costNetTotalKurus: number;
  grossProfitKurus: number;
  cashReceivedKurus: number | null;
  changeKurus: number | null;
  createdByRole: Role;
  userId: number | null;
  userName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface SaleItem {
  id: number;
  saleId: number;
  productId: number;
  productNameSnapshot: string;
  barcodeSnapshot: string | null;
  qty: number;
  unitPriceKurus: number;
  unitCostKurus: number;
  vatRate: number;
  lineDiscountKurus: number;
  lineTotalKurus: number;
  lineNetKurus: number;
  lineVatKurus: number;
  lineCostKurus: number;
  lineCostNetKurus: number;
  lineProfitKurus: number;
  returnedQty: number;
}

const SELECT_SALE = `
  SELECT id, receipt_no AS receiptNo, client_request_id AS clientRequestId, created_at AS createdAt,
         business_date AS businessDate, status, payment_method AS paymentMethod,
         subtotal_kurus AS subtotalKurus, discount_kurus AS discountKurus, total_kurus AS totalKurus,
         net_total_kurus AS netTotalKurus, vat_total_kurus AS vatTotalKurus,
         cost_total_kurus AS costTotalKurus, cost_net_total_kurus AS costNetTotalKurus,
         gross_profit_kurus AS grossProfitKurus, cash_received_kurus AS cashReceivedKurus,
         change_kurus AS changeKurus, created_by_role AS createdByRole, user_id AS userId, user_name AS userName,
         voided_at AS voidedAt, void_reason AS voidReason
    FROM sales`;

const SELECT_ITEM = `
  SELECT id, sale_id AS saleId, product_id AS productId, product_name_snapshot AS productNameSnapshot,
         barcode_snapshot AS barcodeSnapshot, qty, unit_price_kurus AS unitPriceKurus,
         unit_cost_kurus AS unitCostKurus, vat_rate AS vatRate, line_discount_kurus AS lineDiscountKurus,
         line_total_kurus AS lineTotalKurus, line_net_kurus AS lineNetKurus, line_vat_kurus AS lineVatKurus,
         line_cost_kurus AS lineCostKurus, line_cost_net_kurus AS lineCostNetKurus,
         line_profit_kurus AS lineProfitKurus, returned_qty AS returnedQty
    FROM sale_items`;

export function getSaleById(db: DB, id: number): Sale | undefined {
  return db.prepare(`${SELECT_SALE} WHERE id = ?`).get(id) as Sale | undefined;
}

export function getSaleByClientRequestId(db: DB, clientRequestId: string): Sale | undefined {
  return db.prepare(`${SELECT_SALE} WHERE client_request_id = ?`).get(clientRequestId) as Sale | undefined;
}

export function getSaleByReceiptNo(db: DB, receiptNo: string): Sale | undefined {
  return db.prepare(`${SELECT_SALE} WHERE receipt_no = ?`).get(receiptNo) as Sale | undefined;
}

export function listSalesByDate(db: DB, businessDate: string): Sale[] {
  return db.prepare(`${SELECT_SALE} WHERE business_date = ? ORDER BY created_at, id`).all(businessDate) as Sale[];
}

export function getSaleItems(db: DB, saleId: number): SaleItem[] {
  return db.prepare(`${SELECT_ITEM} WHERE sale_id = ? ORDER BY id`).all(saleId) as SaleItem[];
}

export function getSaleItemById(db: DB, id: number): SaleItem | undefined {
  return db.prepare(`${SELECT_ITEM} WHERE id = ?`).get(id) as SaleItem | undefined;
}

/** O iş günündeki bir sonraki fiş sıra numarası (1'den başlar). Transaction içinde çağrılmalı. */
export function nextReceiptSeq(db: DB, businessDate: string): number {
  const r = db
    .prepare(
      `SELECT COALESCE(MAX(CAST(substr(receipt_no, 10) AS INTEGER)), 0) AS maxSeq
         FROM sales WHERE business_date = ?`,
    )
    .get(businessDate) as { maxSeq: number };
  return r.maxSeq + 1;
}

export type NewSale = Omit<Sale, "id" | "voidedAt" | "voidReason" | "status">;

export function insertSale(db: DB, s: NewSale): number {
  return Number(
    db
      .prepare(
        `INSERT INTO sales (receipt_no, client_request_id, created_at, business_date, status, payment_method,
                            subtotal_kurus, discount_kurus, total_kurus, net_total_kurus, vat_total_kurus,
                            cost_total_kurus, cost_net_total_kurus, gross_profit_kurus,
                            cash_received_kurus, change_kurus, created_by_role, user_id, user_name)
         VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.receiptNo, s.clientRequestId, s.createdAt, s.businessDate, s.paymentMethod,
        s.subtotalKurus, s.discountKurus, s.totalKurus, s.netTotalKurus, s.vatTotalKurus,
        s.costTotalKurus, s.costNetTotalKurus, s.grossProfitKurus,
        s.cashReceivedKurus, s.changeKurus, s.createdByRole, s.userId, s.userName,
      ).lastInsertRowid,
  );
}

export type NewSaleItem = Omit<SaleItem, "id" | "returnedQty">;

export function insertSaleItem(db: DB, i: NewSaleItem): number {
  return Number(
    db
      .prepare(
        `INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, barcode_snapshot, qty,
                                 unit_price_kurus, unit_cost_kurus, vat_rate, line_discount_kurus,
                                 line_total_kurus, line_net_kurus, line_vat_kurus, line_cost_kurus,
                                 line_cost_net_kurus, line_profit_kurus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        i.saleId, i.productId, i.productNameSnapshot, i.barcodeSnapshot, i.qty,
        i.unitPriceKurus, i.unitCostKurus, i.vatRate, i.lineDiscountKurus,
        i.lineTotalKurus, i.lineNetKurus, i.lineVatKurus, i.lineCostKurus,
        i.lineCostNetKurus, i.lineProfitKurus,
      ).lastInsertRowid,
  );
}

export function markSaleVoided(db: DB, id: number, voidedAt: string, reason: string): void {
  db.prepare("UPDATE sales SET status = 'voided', voided_at = ?, void_reason = ? WHERE id = ?").run(
    voidedAt,
    reason,
    id,
  );
}

export function addReturnedQty(db: DB, saleItemId: number, qty: number): void {
  db.prepare("UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?").run(qty, saleItemId);
}
