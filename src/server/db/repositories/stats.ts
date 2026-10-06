import type { DB } from "../types";

export interface TodayStats {
  saleCount: number;
  revenueKurus: number;
}

/** Bir iş gününün satış adedi ve iadeler düşülmüş KDV dahil cirosu (iptaller hariç). */
export function getDayQuickStats(db: DB, businessDate: string): TodayStats {
  const s = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_kurus), 0) AS total
         FROM sales WHERE business_date = ? AND status = 'completed'`,
    )
    .get(businessDate) as { n: number; total: number };
  const r = db
    .prepare(`SELECT COALESCE(SUM(refund_total_kurus), 0) AS refunds FROM returns WHERE business_date = ?`)
    .get(businessDate) as { refunds: number };
  return { saleCount: s.n, revenueKurus: s.total - r.refunds };
}

/** Ürünün günlük satılan adedi (iptaller hariç, iadeler düşülmez — satış günü bazında). */
export function getProductDailySales(
  db: DB,
  productId: number,
  from: string,
  to: string,
): { businessDate: string; qty: number; revenueKurus: number }[] {
  return db
    .prepare(
      `SELECT s.business_date AS businessDate, SUM(i.qty) AS qty, SUM(i.line_total_kurus) AS revenueKurus
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
        WHERE i.product_id = ? AND s.status = 'completed' AND s.business_date BETWEEN ? AND ?
        GROUP BY s.business_date ORDER BY s.business_date`,
    )
    .all(productId, from, to) as { businessDate: string; qty: number; revenueKurus: number }[];
}
