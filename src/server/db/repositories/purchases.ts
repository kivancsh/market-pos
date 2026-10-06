import type { DB } from "../types";

export interface NewPurchase {
  supplier: string | null;
  invoiceNo: string | null;
  createdAt: string;
  businessDate: string;
  totalCostKurus: number;
  note: string | null;
}

export function insertPurchase(db: DB, p: NewPurchase): number {
  return Number(
    db
      .prepare(
        `INSERT INTO purchases (supplier, invoice_no, created_at, business_date, total_cost_kurus, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(p.supplier, p.invoiceNo, p.createdAt, p.businessDate, p.totalCostKurus, p.note).lastInsertRowid,
  );
}

export function insertPurchaseItem(
  db: DB,
  i: { purchaseId: number; productId: number; qty: number; unitCostKurus: number },
): number {
  return Number(
    db
      .prepare(`INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost_kurus) VALUES (?, ?, ?, ?)`)
      .run(i.purchaseId, i.productId, i.qty, i.unitCostKurus).lastInsertRowid,
  );
}
