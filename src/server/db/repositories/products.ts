import type { DB } from "../types";

export interface Product {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  salePriceKurus: number;
  avgCostKurus: number;
  vatRate: number;
  stockQty: number;
  minStock: number;
  unit: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const SELECT_PRODUCT = `
  SELECT p.id, p.name, p.category_id AS categoryId, c.name AS categoryName,
         p.sale_price_kurus AS salePriceKurus, p.avg_cost_kurus AS avgCostKurus,
         p.vat_rate AS vatRate, p.stock_qty AS stockQty, p.min_stock AS minStock,
         p.unit, p.is_active AS isActive, p.created_at AS createdAt, p.updated_at AS updatedAt
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id`;

type ProductRaw = Omit<Product, "isActive"> & { isActive: number };
const map = (r: ProductRaw): Product => ({ ...r, isActive: r.isActive === 1 });

export function getProductById(db: DB, id: number): Product | undefined {
  const r = db.prepare(`${SELECT_PRODUCT} WHERE p.id = ?`).get(id) as ProductRaw | undefined;
  return r && map(r);
}

export function listProducts(db: DB, opts: { activeOnly?: boolean } = {}): Product[] {
  const where = opts.activeOnly ? "WHERE p.is_active = 1" : "";
  return (db.prepare(`${SELECT_PRODUCT} ${where} ORDER BY p.name COLLATE NOCASE`).all() as ProductRaw[]).map(
    map,
  );
}

export interface NewProductRow {
  name: string;
  categoryId: number | null;
  salePriceKurus: number;
  avgCostKurus: number;
  vatRate: number;
  minStock: number;
  unit: string;
}

/** Ürünü stok 0 ile ekler (başlangıç stoğu ayrıca 'initial' hareketiyle yazılır). */
export function insertProduct(db: DB, p: NewProductRow, nowIso: string): number {
  return Number(
    db
      .prepare(
        `INSERT INTO products (name, category_id, sale_price_kurus, avg_cost_kurus, vat_rate,
                               stock_qty, min_stock, unit, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1, ?, ?)`,
      )
      .run(p.name, p.categoryId, p.salePriceKurus, p.avgCostKurus, p.vatRate, p.minStock, p.unit, nowIso, nowIso)
      .lastInsertRowid,
  );
}

export interface ProductPatch {
  name?: string;
  categoryId?: number | null;
  salePriceKurus?: number;
  vatRate?: number;
  minStock?: number;
  isActive?: boolean;
}

const PATCH_COLUMNS: Record<keyof ProductPatch, string> = {
  name: "name",
  categoryId: "category_id",
  salePriceKurus: "sale_price_kurus",
  vatRate: "vat_rate",
  minStock: "min_stock",
  isActive: "is_active",
};

export function updateProduct(db: DB, id: number, patch: ProductPatch, nowIso: string): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch) as [keyof ProductPatch, ProductPatch[keyof ProductPatch]][]) {
    if (v === undefined) continue;
    sets.push(`${PATCH_COLUMNS[k]} = ?`);
    values.push(typeof v === "boolean" ? (v ? 1 : 0) : v);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  values.push(nowIso, id);
  db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

/** Sadece stok servisi kullanır: stok_qty değişikliği her zaman bir hareket kaydıyla birlikte yapılmalı. */
export function setStockQty(db: DB, id: number, qty: number, nowIso: string): void {
  db.prepare("UPDATE products SET stock_qty = ?, updated_at = ? WHERE id = ?").run(qty, nowIso, id);
}

export function setAvgCost(db: DB, id: number, avgCostKurus: number, nowIso: string): void {
  db.prepare("UPDATE products SET avg_cost_kurus = ?, updated_at = ? WHERE id = ?").run(avgCostKurus, nowIso, id);
}
