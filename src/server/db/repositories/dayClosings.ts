import type { DB } from "../types";

/** Gün kapalı mı? (Kayıt var ve yeniden açılmamış.) */
export function isDayClosed(db: DB, businessDate: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM day_closings WHERE business_date = ? AND reopened_at IS NULL")
    .get(businessDate);
}

export interface DayClosingRow {
  businessDate: string;
  closedAt: string;
  summaryJson: string;
  expectedCashKurus: number;
  countedCashKurus: number | null;
  cashDifferenceKurus: number | null;
  note: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  /** Yazar kasa Z raporu toplamı (girildiyse) */
  okcZTotalKurus: number | null;
}

export function getDayClosing(db: DB, businessDate: string): DayClosingRow | undefined {
  return db
    .prepare(
      `SELECT business_date AS businessDate, closed_at AS closedAt, summary_json AS summaryJson,
              expected_cash_kurus AS expectedCashKurus, counted_cash_kurus AS countedCashKurus,
              cash_difference_kurus AS cashDifferenceKurus, note, reopened_at AS reopenedAt, reopen_reason AS reopenReason,
              okc_z_total_kurus AS okcZTotalKurus
         FROM day_closings WHERE business_date = ?`,
    )
    .get(businessDate) as DayClosingRow | undefined;
}

export function upsertDayClosing(db: DB, row: Omit<DayClosingRow, "reopenedAt" | "reopenReason">): void {
  db.prepare(
    `INSERT INTO day_closings (business_date, closed_at, summary_json, expected_cash_kurus, counted_cash_kurus,
                               cash_difference_kurus, note, reopened_at, reopen_reason, okc_z_total_kurus)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
     ON CONFLICT(business_date) DO UPDATE SET
       closed_at = excluded.closed_at, summary_json = excluded.summary_json,
       expected_cash_kurus = excluded.expected_cash_kurus, counted_cash_kurus = excluded.counted_cash_kurus,
       cash_difference_kurus = excluded.cash_difference_kurus, note = excluded.note,
       reopened_at = NULL, reopen_reason = NULL, okc_z_total_kurus = excluded.okc_z_total_kurus`,
  ).run(
    row.businessDate,
    row.closedAt,
    row.summaryJson,
    row.expectedCashKurus,
    row.countedCashKurus,
    row.cashDifferenceKurus,
    row.note,
    row.okcZTotalKurus,
  );
}

export function markReopened(db: DB, businessDate: string, at: string, reason: string): void {
  db.prepare("UPDATE day_closings SET reopened_at = ?, reopen_reason = ? WHERE business_date = ?").run(at, reason, businessDate);
}
