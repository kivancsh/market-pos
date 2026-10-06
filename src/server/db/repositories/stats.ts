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
