import type { DB } from "../types";

/** Gün kapalı mı? (Kayıt var ve yeniden açılmamış.) */
export function isDayClosed(db: DB, businessDate: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM day_closings WHERE business_date = ? AND reopened_at IS NULL")
    .get(businessDate);
}
