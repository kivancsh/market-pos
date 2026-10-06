import type { DB } from "../types";

export interface StockMismatch {
  productId: number;
  name: string;
  stockQty: number;
  movementSum: number;
}

/**
 * Değişmez kural: her ürün için products.stock_qty = SUM(stock_movements.qty_change).
 * Kuralı bozan ürünleri döndürür (boş liste = her şey tutarlı).
 */
export function findStockMismatches(db: DB): StockMismatch[] {
  return db
    .prepare(
      `SELECT p.id AS productId, p.name AS name, p.stock_qty AS stockQty,
              COALESCE(SUM(m.qty_change), 0) AS movementSum
         FROM products p
         LEFT JOIN stock_movements m ON m.product_id = p.id
        GROUP BY p.id
       HAVING p.stock_qty <> COALESCE(SUM(m.qty_change), 0)
        ORDER BY p.id`,
    )
    .all() as StockMismatch[];
}
