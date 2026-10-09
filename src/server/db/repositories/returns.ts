import type { DB } from "../types";
import type { PaymentMethod } from "./sales";

export interface Return {
  id: number;
  saleId: number;
  createdAt: string;
  businessDate: string;
  refundTotalKurus: number;
  netTotalKurus: number;
  costTotalKurus: number;
  costNetTotalKurus: number;
  profitReversalKurus: number;
  refundMethod: PaymentMethod;
  reason: string | null;
}

export interface ReturnItem {
  id: number;
  returnId: number;
  saleItemId: number;
  qty: number;
  refundKurus: number;
  netKurus: number;
  costKurus: number;
  costNetKurus: number;
  profitReversalKurus: number;
}

const SELECT_RETURN = `
  SELECT id, sale_id AS saleId, created_at AS createdAt, business_date AS businessDate,
         refund_total_kurus AS refundTotalKurus, net_total_kurus AS netTotalKurus,
         cost_total_kurus AS costTotalKurus, cost_net_total_kurus AS costNetTotalKurus, profit_reversal_kurus AS profitReversalKurus,
         refund_method AS refundMethod, reason
    FROM returns`;

export function getReturnById(db: DB, id: number): Return | undefined {
  return db.prepare(`${SELECT_RETURN} WHERE id = ?`).get(id) as Return | undefined;
}

export function listReturnsBySale(db: DB, saleId: number): Return[] {
  return db.prepare(`${SELECT_RETURN} WHERE sale_id = ? ORDER BY id`).all(saleId) as Return[];
}

export function listReturnItems(db: DB, returnId: number): ReturnItem[] {
  return db
    .prepare(
      `SELECT id, return_id AS returnId, sale_item_id AS saleItemId, qty, refund_kurus AS refundKurus,
              net_kurus AS netKurus, cost_kurus AS costKurus, cost_net_kurus AS costNetKurus, profit_reversal_kurus AS profitReversalKurus
         FROM return_items WHERE return_id = ? ORDER BY id`,
    )
    .all(returnId) as ReturnItem[];
}

export function countReturnsForSale(db: DB, saleId: number): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM returns WHERE sale_id = ?").get(saleId) as { c: number }).c;
}

export function insertReturn(db: DB, r: Omit<Return, "id">): number {
  return Number(
    db
      .prepare(
        `INSERT INTO returns (sale_id, created_at, business_date, refund_total_kurus, net_total_kurus,
                              cost_total_kurus, cost_net_total_kurus, profit_reversal_kurus, refund_method, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        r.saleId, r.createdAt, r.businessDate, r.refundTotalKurus, r.netTotalKurus,
        r.costTotalKurus, r.costNetTotalKurus, r.profitReversalKurus, r.refundMethod, r.reason,
      ).lastInsertRowid,
  );
}

export function insertReturnItem(db: DB, i: Omit<ReturnItem, "id">): number {
  return Number(
    db
      .prepare(
        `INSERT INTO return_items (return_id, sale_item_id, qty, refund_kurus, net_kurus, cost_kurus, cost_net_kurus,
                                   profit_reversal_kurus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(i.returnId, i.saleItemId, i.qty, i.refundKurus, i.netKurus, i.costKurus, i.costNetKurus, i.profitReversalKurus)
      .lastInsertRowid,
  );
}
