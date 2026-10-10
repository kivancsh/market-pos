import type { DB } from "../types";

export type ReportTrigger = "close" | "auto" | "manual";

export function hasDailyReport(db: DB, businessDate: string): boolean {
  return !!db.prepare("SELECT 1 FROM daily_report_log WHERE business_date = ?").get(businessDate);
}

export function insertDailyReportLog(db: DB, businessDate: string, trigger: ReportTrigger, recipients: string[], nowIso: string): void {
  db.prepare("INSERT INTO daily_report_log (business_date, trigger, recipients, sent_at) VALUES (?, ?, ?, ?)").run(
    businessDate,
    trigger,
    recipients.join(", "),
    nowIso,
  );
}

export function lastDailyReport(db: DB, businessDate: string): { trigger: ReportTrigger; sentAt: string; recipients: string } | undefined {
  return db
    .prepare("SELECT trigger, sent_at AS sentAt, recipients FROM daily_report_log WHERE business_date = ? ORDER BY id DESC LIMIT 1")
    .get(businessDate) as { trigger: ReportTrigger; sentAt: string; recipients: string } | undefined;
}
