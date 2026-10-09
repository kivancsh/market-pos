import type { DB } from "../types";

export interface AuditEntry {
  id: number;
  createdAt: string;
  businessDate: string;
  userId: number | null;
  userName: string | null;
  role: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  summary: string;
  detailsJson: string | null;
}

export function insertAudit(db: DB, e: Omit<AuditEntry, "id">): void {
  db.prepare(
    `INSERT INTO audit_log (created_at, business_date, user_id, user_name, role, action, entity_type, entity_id, summary, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(e.createdAt, e.businessDate, e.userId, e.userName, e.role, e.action, e.entityType, e.entityId, e.summary, e.detailsJson);
}

export interface AuditFilter {
  from: string;
  to: string;
  action?: string | null;
  userId?: number | null;
  limit: number;
  offset: number;
}

export function listAudit(db: DB, f: AuditFilter): { items: AuditEntry[]; total: number } {
  const where = ["business_date BETWEEN ? AND ?"];
  const args: (string | number)[] = [f.from, f.to];
  if (f.action) {
    where.push("action LIKE ?");
    args.push(`${f.action}%`);
  }
  if (f.userId) {
    where.push("user_id = ?");
    args.push(f.userId);
  }
  const w = where.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ${w}`).get(...args) as { n: number }).n;
  const items = db
    .prepare(
      `SELECT id, created_at AS createdAt, business_date AS businessDate, user_id AS userId, user_name AS userName, role,
              action, entity_type AS entityType, entity_id AS entityId, summary, details_json AS detailsJson
         FROM audit_log WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, f.limit, f.offset) as AuditEntry[];
  return { items, total };
}
