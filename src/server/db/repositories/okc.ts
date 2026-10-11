import type { OkcProvider, OkcStatus } from "@/lib/okc";
import type { DB } from "../types";

export interface OkcDocument {
  id: number;
  saleId: number;
  provider: OkcProvider;
  orderId: string;
  status: OkcStatus;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  printedAt: string | null;
  documentNo: string | null;
  zNo: string | null;
  confirmationCode: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

const SELECT = `SELECT id, sale_id AS saleId, provider, order_id AS orderId, status, created_at AS createdAt, updated_at AS updatedAt,
                       sent_at AS sentAt, printed_at AS printedAt, document_no AS documentNo, z_no AS zNo,
                       confirmation_code AS confirmationCode, error_code AS errorCode, error_message AS errorMessage
                  FROM okc_documents`;

export function insertOkcDocument(db: DB, d: { saleId: number; provider: OkcProvider; orderId: string; nowIso: string }): number {
  return Number(
    db
      .prepare(
        `INSERT INTO okc_documents (sale_id, provider, order_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      )
      .run(d.saleId, d.provider, d.orderId, d.nowIso, d.nowIso).lastInsertRowid,
  );
}

export function getOkcBySale(db: DB, saleId: number): OkcDocument | undefined {
  return db.prepare(`${SELECT} WHERE sale_id = ?`).get(saleId) as OkcDocument | undefined;
}

export function getOkcByOrderId(db: DB, orderId: string): OkcDocument | undefined {
  return db.prepare(`${SELECT} WHERE order_id = ?`).get(orderId) as OkcDocument | undefined;
}

/** Yazar kasanın alabileceği açık siparişler (bekleyen + cihazda açılmış), eskiden yeniye. */
export function listOpenOkcDocuments(db: DB, provider: OkcProvider): OkcDocument[] {
  return db.prepare(`${SELECT} WHERE provider = ? AND status IN ('pending', 'sent') ORDER BY id`).all(provider) as OkcDocument[];
}

/** Yazar kasanın sonradan bildirebileceği (fişi kesilmemiş) siparişler: bekleyen, açılmış, hatalı. */
export function listUnprintedOkcDocuments(db: DB, provider: OkcProvider): OkcDocument[] {
  return db.prepare(`${SELECT} WHERE provider = ? AND status IN ('pending', 'sent', 'failed') ORDER BY id`).all(provider) as OkcDocument[];
}

/** Bir iş gününde yasal fişi kesilmemiş (bekleyen/hatalı) satış sayısı. */
export function countUnprintedForDate(db: DB, businessDate: string): number {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS n FROM okc_documents o JOIN sales s ON s.id = o.sale_id
        WHERE s.business_date = ? AND s.status = 'completed' AND o.status IN ('pending', 'sent', 'failed')`,
    )
    .get(businessDate) as { n: number };
  return r.n;
}

export function markOkcSent(db: DB, id: number, nowIso: string): void {
  db.prepare("UPDATE okc_documents SET status = 'sent', sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ? AND status = 'pending'").run(
    nowIso,
    nowIso,
    id,
  );
}

export function markOkcPrinted(
  db: DB,
  id: number,
  r: { nowIso: string; documentNo: string | null; zNo: string | null; confirmationCode: string | null; resultJson: string | null },
): void {
  db.prepare(
    `UPDATE okc_documents SET status = 'printed', printed_at = ?, updated_at = ?, document_no = ?, z_no = ?,
            confirmation_code = ?, result_json = ?, error_code = NULL, error_message = NULL
      WHERE id = ?`,
  ).run(r.nowIso, r.nowIso, r.documentNo, r.zNo, r.confirmationCode, r.resultJson, id);
}

export function markOkcFailed(db: DB, id: number, r: { nowIso: string; code: string; message: string; resultJson: string | null }): void {
  db.prepare(
    `UPDATE okc_documents SET status = 'failed', updated_at = ?, error_code = ?, error_message = ?, result_json = ?
      WHERE id = ? AND status IN ('pending', 'sent')`,
  ).run(r.nowIso, r.code, r.message, r.resultJson, id);
}

/** Hatalı fişi yeniden kuyruğa al (yazar kasa tekrar alabilsin). */
export function requeueOkc(db: DB, id: number, nowIso: string): void {
  db.prepare(
    "UPDATE okc_documents SET status = 'pending', sent_at = NULL, updated_at = ?, error_code = NULL, error_message = NULL WHERE id = ? AND status = 'failed'",
  ).run(nowIso, id);
}

export function markOkcCancelled(db: DB, id: number, nowIso: string): void {
  db.prepare("UPDATE okc_documents SET status = 'cancelled', updated_at = ? WHERE id = ? AND status <> 'printed'").run(nowIso, id);
}
