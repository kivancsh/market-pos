import type { DB } from "../types";

export type BarcodeType = "internal" | "manufacturer";

export interface ProductBarcode {
  id: number;
  productId: number;
  barcode: string;
  type: BarcodeType;
  isPrimary: boolean;
  createdAt: string;
}

const SELECT = `SELECT id, product_id AS productId, barcode, type, is_primary AS isPrimary, created_at AS createdAt
                  FROM product_barcodes`;
type Raw = Omit<ProductBarcode, "isPrimary"> & { isPrimary: number };
const map = (r: Raw): ProductBarcode => ({ ...r, isPrimary: r.isPrimary === 1 });

export function findBarcode(db: DB, barcode: string): ProductBarcode | undefined {
  const r = db.prepare(`${SELECT} WHERE barcode = ?`).get(barcode) as Raw | undefined;
  return r && map(r);
}

export function getBarcodeById(db: DB, id: number): ProductBarcode | undefined {
  const r = db.prepare(`${SELECT} WHERE id = ?`).get(id) as Raw | undefined;
  return r && map(r);
}

export function listBarcodesByProduct(db: DB, productId: number): ProductBarcode[] {
  return (
    db.prepare(`${SELECT} WHERE product_id = ? ORDER BY is_primary DESC, id`).all(productId) as Raw[]
  ).map(map);
}

/** Tüm barkodlar (ürün id'sine göre gruplamak için). */
export function listAllBarcodes(db: DB): ProductBarcode[] {
  return (db.prepare(`${SELECT} ORDER BY product_id, is_primary DESC, id`).all() as Raw[]).map(map);
}

export function insertBarcode(
  db: DB,
  b: { productId: number; barcode: string; type: BarcodeType; isPrimary: boolean },
  nowIso: string,
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO product_barcodes (product_id, barcode, type, is_primary, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(b.productId, b.barcode, b.type, b.isPrimary ? 1 : 0, nowIso).lastInsertRowid,
  );
}

export function deleteBarcode(db: DB, id: number): void {
  db.prepare("DELETE FROM product_barcodes WHERE id = ?").run(id);
}

/** Ürünün birincil barkodunu değiştirir (önce eskisini kaldırır; tekil indeks bozulmaz). */
export function setPrimaryBarcode(db: DB, productId: number, barcodeId: number): void {
  db.prepare("UPDATE product_barcodes SET is_primary = 0 WHERE product_id = ? AND is_primary = 1").run(productId);
  db.prepare("UPDATE product_barcodes SET is_primary = 1 WHERE id = ? AND product_id = ?").run(barcodeId, productId);
}

export function hasPrimaryBarcode(db: DB, productId: number): boolean {
  return !!db.prepare("SELECT 1 FROM product_barcodes WHERE product_id = ? AND is_primary = 1").get(productId);
}

export function listProductIdsWithoutBarcode(db: DB): number[] {
  return (
    db
      .prepare(
        `SELECT p.id FROM products p
          WHERE NOT EXISTS (SELECT 1 FROM product_barcodes b WHERE b.product_id = p.id)
          ORDER BY p.id`,
      )
      .all() as { id: number }[]
  ).map((r) => r.id);
}
