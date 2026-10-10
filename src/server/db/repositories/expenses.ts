import { netOfVat } from "@/lib/pricing";
import type { DB } from "../types";

export interface Expense {
  id: number;
  businessDate: string;
  category: string;
  description: string | null;
  amountKurus: number;
  vatRate: number;
  netKurus: number;
  vatKurus: number;
  createdAt: string;
  updatedAt: string | null;
  userName: string | null;
}

const SELECT = `SELECT id, business_date AS businessDate, category, description, amount_kurus AS amountKurus, vat_rate AS vatRate,
                       net_kurus AS netKurus, vat_kurus AS vatKurus, created_at AS createdAt, updated_at AS updatedAt, user_name AS userName
                  FROM expenses`;

export function listExpenses(db: DB, from: string, to: string): Expense[] {
  return db.prepare(`${SELECT} WHERE deleted_at IS NULL AND business_date BETWEEN ? AND ? ORDER BY business_date DESC, id DESC`).all(from, to) as Expense[];
}

export function getExpense(db: DB, id: number): Expense | undefined {
  return db.prepare(`${SELECT} WHERE id = ? AND deleted_at IS NULL`).get(id) as Expense | undefined;
}

export interface ExpenseRow {
  businessDate: string;
  category: string;
  description: string | null;
  amountKurus: number;
  vatRate: number;
  netKurus: number;
  vatKurus: number;
}

export function insertExpense(db: DB, e: ExpenseRow, nowIso: string, user: { id: number | null; name: string | null }): number {
  return Number(
    db
      .prepare(
        `INSERT INTO expenses (business_date, category, description, amount_kurus, vat_rate, net_kurus, vat_kurus, created_at, user_id, user_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(e.businessDate, e.category, e.description, e.amountKurus, e.vatRate, e.netKurus, e.vatKurus, nowIso, user.id, user.name).lastInsertRowid,
  );
}

export function updateExpenseRow(db: DB, id: number, e: ExpenseRow, nowIso: string): void {
  db.prepare(
    `UPDATE expenses SET business_date = ?, category = ?, description = ?, amount_kurus = ?, vat_rate = ?, net_kurus = ?, vat_kurus = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
  ).run(e.businessDate, e.category, e.description, e.amountKurus, e.vatRate, e.netKurus, e.vatKurus, nowIso, id);
}

export function softDeleteExpense(db: DB, id: number, nowIso: string): void {
  db.prepare("UPDATE expenses SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").run(nowIso, id);
}

export interface ExpenseTotals {
  amountKurus: number;
  netKurus: number;
  vatKurus: number;
  byCategory: { category: string; amountKurus: number; netKurus: number; vatKurus: number; count: number }[];
}

export function expenseTotals(db: DB, from: string, to: string): ExpenseTotals {
  const byCategory = db
    .prepare(
      `SELECT category, COALESCE(SUM(amount_kurus),0) AS amountKurus, COALESCE(SUM(net_kurus),0) AS netKurus,
              COALESCE(SUM(vat_kurus),0) AS vatKurus, COUNT(*) AS count
         FROM expenses WHERE deleted_at IS NULL AND business_date BETWEEN ? AND ? GROUP BY category ORDER BY amountKurus DESC`,
    )
    .all(from, to) as ExpenseTotals["byCategory"];
  return {
    amountKurus: byCategory.reduce((a, c) => a + c.amountKurus, 0),
    netKurus: byCategory.reduce((a, c) => a + c.netKurus, 0),
    vatKurus: byCategory.reduce((a, c) => a + c.vatKurus, 0),
    byCategory,
  };
}

/** Mal alışlarının KDV dahil toplamı ve (ürünün şu anki KDV oranıyla) içindeki KDV — yaklaşık indirilecek KDV. */
export function purchaseTotals(db: DB, from: string, to: string): { amountKurus: number; vatKurus: number } {
  const rows = db
    .prepare(
      `SELECT pi.qty * pi.unit_cost_kurus AS amount, p.vat_rate AS vatRate
         FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id JOIN products p ON p.id = pi.product_id
        WHERE pu.business_date BETWEEN ? AND ?`,
    )
    .all(from, to) as { amount: number; vatRate: number }[];
  let amountKurus = 0;
  let vatKurus = 0;
  for (const r of rows) {
    amountKurus += r.amount;
    vatKurus += r.amount - netOfVat(r.amount, r.vatRate);
  }
  return { amountKurus, vatKurus };
}
