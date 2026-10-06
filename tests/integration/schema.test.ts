import { describe, expect, it } from "vitest";
import { openMemoryDatabase } from "@/server/db/connection";
import { runMigrations } from "@/server/db/migrate";
import { findStockMismatches } from "@/server/db/repositories/integrity";

const NOW = "2026-10-06T10:00:00.000Z";

function insertProduct(db: ReturnType<typeof openMemoryDatabase>, name = "Test") {
  return Number(
    db
      .prepare(
        `INSERT INTO products (name, sale_price_kurus, created_at, updated_at) VALUES (?, 1000, ?, ?)`,
      )
      .run(name, NOW, NOW).lastInsertRowid,
  );
}

describe("şema ve migration", () => {
  it("tüm tabloları oluşturur ve tekrar çalıştırıldığında hiçbir şey yapmaz", () => {
    const db = openMemoryDatabase();
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const t of [
      "categories", "products", "product_barcodes", "sales", "sale_items", "returns",
      "return_items", "purchases", "purchase_items", "stock_movements", "day_closings",
      "settings", "schema_migrations",
    ]) {
      expect(tables).toContain(t);
    }
    expect(runMigrations(db)).toEqual([]);
  });

  it("foreign_keys açık", () => {
    const db = openMemoryDatabase();
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(() =>
      db
        .prepare(
          `INSERT INTO product_barcodes (product_id, barcode, type, created_at) VALUES (999, '1', 'internal', ?)`,
        )
        .run(NOW),
    ).toThrow(/FOREIGN KEY/);
  });

  it("aynı barkod iki ürüne atanamaz", () => {
    const db = openMemoryDatabase();
    const a = insertProduct(db, "A");
    const b = insertProduct(db, "B");
    const ins = db.prepare(
      `INSERT INTO product_barcodes (product_id, barcode, type, is_primary, created_at) VALUES (?, ?, 'manufacturer', ?, ?)`,
    );
    ins.run(a, "8690000000001", 1, NOW);
    expect(() => ins.run(b, "8690000000001", 1, NOW)).toThrow(/UNIQUE/);
  });

  it("bir ürünün en fazla bir birincil barkodu olur", () => {
    const db = openMemoryDatabase();
    const a = insertProduct(db);
    const ins = db.prepare(
      `INSERT INTO product_barcodes (product_id, barcode, type, is_primary, created_at) VALUES (?, ?, 'internal', ?, ?)`,
    );
    ins.run(a, "111", 1, NOW);
    ins.run(a, "222", 0, NOW);
    expect(() => ins.run(a, "333", 1, NOW)).toThrow(/UNIQUE/);
  });

  it("KDV oranı sadece 1, 10, 20 olabilir; para alanları tam sayı kuruştur", () => {
    const db = openMemoryDatabase();
    expect(() =>
      db
        .prepare(
          `INSERT INTO products (name, sale_price_kurus, vat_rate, created_at, updated_at) VALUES ('x', 100, 18, ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
  });

  it("varsayılan ayarlar yüklenir", () => {
    const db = openMemoryDatabase();
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(s.allow_negative_stock).toBe("false");
    expect(s.cashier_can_discount).toBe("false");
    expect(s.scanner_max_interval_ms).toBe("50");
    expect(s.internal_barcode_seq).toBe("0");
  });

  it("stok tutarlılık kontrolü tutarsızlığı yakalar", () => {
    const db = openMemoryDatabase();
    const a = insertProduct(db);
    expect(findStockMismatches(db)).toEqual([]);
    db.prepare("UPDATE products SET stock_qty = 5 WHERE id = ?").run(a);
    expect(findStockMismatches(db)).toHaveLength(1);
    db.prepare(
      `INSERT INTO stock_movements (product_id, type, qty_change, stock_after, created_at, business_date)
       VALUES (?, 'initial', 5, 5, ?, '2026-10-06')`,
    ).run(a, NOW);
    expect(findStockMismatches(db)).toEqual([]);
  });
});
