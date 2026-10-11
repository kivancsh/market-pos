/** Yapay zekâ asistanı: aylık rapor, hedef ve aksiyon kayıtları. */
import type { ActionStatus, TargetMetric } from "@/lib/assistant";
import type { DB } from "../types";

export interface MonthlyReportRow {
  month: string;
  periodTo: string;
  isPartial: boolean;
  createdAt: string;
  updatedAt: string;
  factsJson: string;
  aiJson: string | null;
  aiModel: string | null;
  aiGeneratedAt: string | null;
  aiError: string | null;
  aiAttempts: number;
  aiLastAttemptAt: string | null;
  emailedAt: string | null;
}

const REPORT_COLS = `month, period_to AS periodTo, is_partial AS isPartial, created_at AS createdAt, updated_at AS updatedAt,
  facts_json AS factsJson, ai_json AS aiJson, ai_model AS aiModel, ai_generated_at AS aiGeneratedAt, ai_error AS aiError,
  ai_attempts AS aiAttempts, ai_last_attempt_at AS aiLastAttemptAt, emailed_at AS emailedAt`;

function toReport(r: (Omit<MonthlyReportRow, "isPartial"> & { isPartial: number }) | undefined): MonthlyReportRow | undefined {
  return r ? { ...r, isPartial: r.isPartial === 1 } : undefined;
}

export function getMonthlyReport(db: DB, month: string): MonthlyReportRow | undefined {
  return toReport(db.prepare(`SELECT ${REPORT_COLS} FROM monthly_reports WHERE month = ?`).get(month) as never);
}

export function listMonthlyReports(db: DB): { month: string; periodTo: string; isPartial: boolean; hasAi: boolean; updatedAt: string }[] {
  return (
    db
      .prepare("SELECT month, period_to AS periodTo, is_partial AS isPartial, ai_json IS NOT NULL AS hasAi, updated_at AS updatedAt FROM monthly_reports ORDER BY month DESC")
      .all() as { month: string; periodTo: string; isPartial: number; hasAi: number; updatedAt: string }[]
  ).map((r) => ({ ...r, isPartial: r.isPartial === 1, hasAi: r.hasAi === 1 }));
}

/** Yerel analizi yazar (yeniden oluşturmada eski yapay zekâ yorumu silinir; rakamlar değişmiş olabilir). */
export function upsertMonthlyFacts(db: DB, month: string, periodTo: string, isPartial: boolean, factsJson: string, nowIso: string): void {
  db.prepare(
    `INSERT INTO monthly_reports (month, period_to, is_partial, created_at, updated_at, facts_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET period_to = excluded.period_to, is_partial = excluded.is_partial, updated_at = excluded.updated_at,
       facts_json = excluded.facts_json, ai_json = NULL, ai_model = NULL, ai_generated_at = NULL, ai_error = NULL, ai_attempts = 0,
       ai_last_attempt_at = NULL, emailed_at = CASE WHEN excluded.is_partial = 0 AND monthly_reports.is_partial = 1 THEN NULL ELSE monthly_reports.emailed_at END`,
  ).run(month, periodTo, isPartial ? 1 : 0, nowIso, nowIso, factsJson);
}

export function saveMonthlyAi(db: DB, month: string, aiJson: string, model: string, nowIso: string): void {
  db.prepare(
    `UPDATE monthly_reports SET ai_json = ?, ai_model = ?, ai_generated_at = ?, ai_error = NULL, ai_attempts = ai_attempts + 1,
       ai_last_attempt_at = ?, updated_at = ? WHERE month = ?`,
  ).run(aiJson, model, nowIso, nowIso, nowIso, month);
}

export function saveMonthlyAiError(db: DB, month: string, message: string, nowIso: string): void {
  db.prepare("UPDATE monthly_reports SET ai_error = ?, ai_attempts = ai_attempts + 1, ai_last_attempt_at = ? WHERE month = ?").run(message, nowIso, month);
}

export function markMonthlyEmailed(db: DB, month: string, nowIso: string): void {
  db.prepare("UPDATE monthly_reports SET emailed_at = ? WHERE month = ?").run(nowIso, month);
}

// ------------------------------------------------------------------ hedefler

export interface TargetRow {
  month: string;
  metric: TargetMetric;
  target: number;
  baseline: number;
  source: "auto" | "owner";
  rationale: string | null;
  updatedAt: string;
}

export function listTargets(db: DB, month: string): TargetRow[] {
  return db
    .prepare(
      `SELECT month, metric, target, baseline, source, rationale, updated_at AS updatedAt FROM monthly_targets WHERE month = ?
        ORDER BY CASE metric WHEN 'revenue' THEN 1 WHEN 'gross_profit' THEN 2 WHEN 'net_profit' THEN 3 WHEN 'margin' THEN 4
                             WHEN 'avg_basket' THEN 5 WHEN 'sale_count' THEN 6 ELSE 7 END`,
    )
    .all(month) as TargetRow[];
}

/** Otomatik hedef yazar; yöneticinin girdiği hedefin üzerine yazmaz. */
export function upsertAutoTarget(db: DB, t: Omit<TargetRow, "source" | "updatedAt">, nowIso: string): void {
  db.prepare(
    `INSERT INTO monthly_targets (month, metric, target, baseline, source, rationale, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'auto', ?, ?, ?)
     ON CONFLICT(month, metric) DO UPDATE SET target = excluded.target, baseline = excluded.baseline, rationale = excluded.rationale,
       updated_at = excluded.updated_at WHERE monthly_targets.source = 'auto'`,
  ).run(t.month, t.metric, t.target, t.baseline, t.rationale, nowIso, nowIso);
}

export function setOwnerTarget(db: DB, month: string, metric: TargetMetric, target: number, baseline: number, nowIso: string): void {
  db.prepare(
    `INSERT INTO monthly_targets (month, metric, target, baseline, source, rationale, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'owner', 'Yönetici belirledi', ?, ?)
     ON CONFLICT(month, metric) DO UPDATE SET target = excluded.target, source = 'owner', rationale = 'Yönetici belirledi', updated_at = excluded.updated_at`,
  ).run(month, metric, target, baseline, nowIso, nowIso);
}

export function deleteAutoTargets(db: DB, month: string): void {
  db.prepare("DELETE FROM monthly_targets WHERE month = ? AND source = 'auto'").run(month);
}

// ------------------------------------------------------------------ aksiyonlar

export interface ActionStatusRow {
  month: string;
  actionKey: string;
  status: ActionStatus;
  title: string;
  updatedAt: string;
}

export function listActionStatuses(db: DB, month: string): ActionStatusRow[] {
  return db
    .prepare("SELECT month, action_key AS actionKey, status, title, updated_at AS updatedAt FROM monthly_action_status WHERE month = ?")
    .all(month) as ActionStatusRow[];
}

export function setActionStatus(db: DB, month: string, actionKey: string, status: ActionStatus, title: string, nowIso: string): void {
  db.prepare(
    `INSERT INTO monthly_action_status (month, action_key, status, title, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(month, action_key) DO UPDATE SET status = excluded.status, title = excluded.title, updated_at = excluded.updated_at`,
  ).run(month, actionKey, status, title, nowIso);
}
