/**
 * Aylık analiz için ek sorgular (yapay zekâ asistanı). İptal edilen satışlar hiçbir hesaba girmez.
 */
import type { DB } from "../types";

export interface ProductUnitEconomics {
  productId: number;
  qty: number;
  /** KDV dahil satış (indirim sonrası) ve maliyet toplamı */
  totalKurus: number;
  costKurus: number;
  /** Liste fiyatıyla (indirimsiz) toplam: qty × birim fiyat */
  listKurus: number;
  saleCount: number;
}

/** Ürün başına aralıktaki satış adedi, tutar, maliyet (birim fiyat/maliyet ortalaması için). */
export function getProductUnitEconomics(db: DB, from: string, to: string): Map<number, ProductUnitEconomics> {
  const rows = db
    .prepare(
      `SELECT i.product_id AS productId, SUM(i.qty) AS qty, SUM(i.line_total_kurus) AS totalKurus, SUM(i.line_cost_kurus) AS costKurus,
              SUM(i.qty * i.unit_price_kurus) AS listKurus, COUNT(DISTINCT i.sale_id) AS saleCount
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
        WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
        GROUP BY i.product_id`,
    )
    .all(from, to) as ProductUnitEconomics[];
  return new Map(rows.map((r) => [r.productId, r]));
}

export interface ProductPair {
  a: number;
  b: number;
  together: number;
}

/** Aynı fişte birlikte alınan ürün çiftleri (en az `minTogether` fişte). */
export function getProductPairs(db: DB, from: string, to: string, minTogether: number, limit: number): ProductPair[] {
  return db
    .prepare(
      `SELECT x.product_id AS a, y.product_id AS b, COUNT(DISTINCT x.sale_id) AS together
         FROM sale_items x
         JOIN sale_items y ON y.sale_id = x.sale_id AND x.product_id < y.product_id
         JOIN sales s ON s.id = x.sale_id
        WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
        GROUP BY x.product_id, y.product_id
       HAVING together >= ?
        ORDER BY together DESC LIMIT ?`,
    )
    .all(from, to, minTogether, limit) as ProductPair[];
}

export interface ClosingStats {
  closedDays: number;
  countedDays: number;
  shortageDays: number;
  shortageKurus: number;
  excessDays: number;
  excessKurus: number;
  okcDays: number;
  okcZTotalKurus: number;
  okcExpectedKurus: number;
}

/** Aralıktaki gün kapanışları: sayım farkları ve yazar kasa Z karşılaştırması. */
export function getClosingStats(db: DB, from: string, to: string): ClosingStats & { closedDates: string[] } {
  const rows = db
    .prepare(
      `SELECT business_date AS d, counted_cash_kurus AS counted, cash_difference_kurus AS diff, okc_z_total_kurus AS z, summary_json AS summary
         FROM day_closings WHERE reopened_at IS NULL AND business_date BETWEEN ? AND ?`,
    )
    .all(from, to) as { d: string; counted: number | null; diff: number | null; z: number | null; summary: string }[];
  const s: ClosingStats = {
    closedDays: rows.length,
    countedDays: 0,
    shortageDays: 0,
    shortageKurus: 0,
    excessDays: 0,
    excessKurus: 0,
    okcDays: 0,
    okcZTotalKurus: 0,
    okcExpectedKurus: 0,
  };
  for (const r of rows) {
    if (r.counted !== null) s.countedDays += 1;
    if (r.diff !== null && r.diff < 0) {
      s.shortageDays += 1;
      s.shortageKurus += -r.diff;
    } else if (r.diff !== null && r.diff > 0) {
      s.excessDays += 1;
      s.excessKurus += r.diff;
    }
    if (r.z !== null) {
      s.okcDays += 1;
      s.okcZTotalKurus += r.z;
      try {
        const rev = (JSON.parse(r.summary) as { summary?: { revenueGrossKurus?: number } }).summary?.revenueGrossKurus;
        s.okcExpectedKurus += Number.isSafeInteger(rev) ? rev! : 0;
      } catch {
        /* özet okunamadı */
      }
    }
  }
  return { ...s, closedDates: rows.map((r) => r.d) };
}

/** Satış yapılan iş günleri. */
export function getSellingDays(db: DB, from: string, to: string): string[] {
  return (
    db.prepare("SELECT DISTINCT business_date AS d FROM sales WHERE status = 'completed' AND business_date BETWEEN ? AND ? ORDER BY d").all(from, to) as {
      d: string;
    }[]
  ).map((r) => r.d);
}

/** İlk satış günü (hiç satış yoksa null). */
export function getFirstSaleDate(db: DB): string | null {
  return (db.prepare("SELECT MIN(business_date) AS d FROM sales WHERE status = 'completed'").get() as { d: string | null }).d;
}

/** Ürünlerin belli bir günün sonundaki stok adedi (o günden sonraki hareketler geri alınarak). */
export function getStockAtEndOf(db: DB, businessDate: string): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT p.id, p.stock_qty - COALESCE((SELECT SUM(m.qty_change) FROM stock_movements m WHERE m.product_id = p.id AND m.business_date > ?), 0) AS qty
         FROM products p`,
    )
    .all(businessDate) as { id: number; qty: number }[];
  return new Map(rows.map((r) => [r.id, r.qty]));
}

/** Ürün başına aralıkta iade edilen adet ve iade sayısı. */
export function getProductReturns(db: DB, from: string, to: string): Map<number, { qty: number; count: number; refundKurus: number }> {
  const rows = db
    .prepare(
      `SELECT si.product_id AS productId, SUM(ri.qty) AS qty, COUNT(DISTINCT ri.return_id) AS count, SUM(ri.refund_kurus) AS refundKurus
         FROM return_items ri JOIN returns r ON r.id = ri.return_id JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.business_date BETWEEN ? AND ? GROUP BY si.product_id`,
    )
    .all(from, to) as { productId: number; qty: number; count: number; refundKurus: number }[];
  return new Map(rows.map((r) => [r.productId, r]));
}

/** Aralıkta yapılan mal alışı (KDV dahil) ve fiş sayısı. */
export function getPurchaseStats(db: DB, from: string, to: string): { count: number; totalKurus: number } {
  return db
    .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_cost_kurus),0) AS totalKurus FROM purchases WHERE business_date BETWEEN ? AND ?")
    .get(from, to) as { count: number; totalKurus: number };
}

/** İşlem geçmişinde aralıktaki bazı işlemlerin sayısı (fiyat değişikliği vb.). */
export function countAuditActions(db: DB, from: string, to: string, actions: string[]): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT action, COUNT(*) AS n FROM audit_log WHERE business_date BETWEEN ? AND ? AND action IN (${actions.map(() => "?").join(",")}) GROUP BY action`,
    )
    .all(from, to, ...actions) as { action: string; n: number }[];
  return Object.fromEntries(actions.map((a) => [a, rows.find((r) => r.action === a)?.n ?? 0]));
}

export interface ProductInfoRow {
  id: number;
  name: string;
  categoryName: string | null;
  salePriceKurus: number;
  avgCostKurus: number;
  vatRate: number;
  stockQty: number;
  minStock: number;
  isActive: boolean;
}

export function listProductInfo(db: DB): Map<number, ProductInfoRow> {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, c.name AS categoryName, p.sale_price_kurus AS salePriceKurus, p.avg_cost_kurus AS avgCostKurus,
              p.vat_rate AS vatRate, p.stock_qty AS stockQty, p.min_stock AS minStock, p.is_active AS isActive
         FROM products p LEFT JOIN categories c ON c.id = p.category_id`,
    )
    .all() as (Omit<ProductInfoRow, "isActive"> & { isActive: number })[];
  return new Map(rows.map((r) => [r.id, { ...r, isActive: r.isActive === 1 }]));
}
