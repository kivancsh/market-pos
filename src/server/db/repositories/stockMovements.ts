import type { DB } from "../types";

export type MovementType = "initial" | "sale" | "void" | "return" | "purchase" | "adjustment";

export interface NewMovement {
  productId: number;
  type: MovementType;
  qtyChange: number;
  stockAfter: number;
  unitCostKurus: number | null;
  refType: string | null;
  refId: number | null;
  note: string | null;
  createdAt: string;
  businessDate: string;
}

export interface StockMovement extends NewMovement {
  id: number;
}

export function insertMovement(db: DB, m: NewMovement): number {
  return Number(
    db
      .prepare(
        `INSERT INTO stock_movements (product_id, type, qty_change, stock_after, unit_cost_kurus,
                                      ref_type, ref_id, note, created_at, business_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        m.productId, m.type, m.qtyChange, m.stockAfter, m.unitCostKurus,
        m.refType, m.refId, m.note, m.createdAt, m.businessDate,
      ).lastInsertRowid,
  );
}

export function listMovementsByProduct(db: DB, productId: number, limit = 200): StockMovement[] {
  return db
    .prepare(
      `SELECT id, product_id AS productId, type, qty_change AS qtyChange, stock_after AS stockAfter,
              unit_cost_kurus AS unitCostKurus, ref_type AS refType, ref_id AS refId, note,
              created_at AS createdAt, business_date AS businessDate
         FROM stock_movements WHERE product_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(productId, limit) as StockMovement[];
}
