import { describe, expect, it } from "vitest";
import { isValidEan13 } from "@/lib/barcode";
import { getBusinessDate, getIstanbulHour } from "@/lib/businessDate";
import { openMemoryDatabase } from "@/server/db/connection";
import { findStockMismatches } from "@/server/db/repositories/integrity";
import { resolveBarcode } from "@/server/services/barcodes";
import { SEED_PRODUCTS } from "@/server/seed/data";
import { barcodesToCsv, runSeed } from "@/server/seed/seed";

// Seed bugünün saatine göre çalışır; testte sabit bir "şimdi" kullanılır (İstanbul 6 Ekim 2026, 18:30).
const NOW = new Date("2026-10-06T15:30:00.000Z");

describe("seed", () => {
  const db = openMemoryDatabase();
  const result = runSeed(db, { now: NOW });
  const ctx = { db, now: () => NOW };
  const q = <T>(sql: string, ...args: unknown[]) => db.prepare(sql).all(...args) as T[];

  it("27 ürün, her birinin geçerli 200 önekli birincil barkodu var", () => {
    expect(result.products).toBe(27);
    const primaries = result.barcodes.filter((b) => b.isPrimary);
    expect(primaries).toHaveLength(27);
    for (const b of primaries) {
      expect(b.type).toBe("internal");
      expect(b.barcode).toMatch(/^200\d{10}$/);
      expect(isValidEan13(b.barcode)).toBe(true);
    }
  });

  it("1, 3 ve 11 numaralı ürünlerde geçerli 869 önekli üretici barkodu var", () => {
    const m = result.barcodes.filter((b) => b.type === "manufacturer");
    expect(m.map((b) => b.no).sort((a, b) => a - b)).toEqual([1, 3, 11]);
    for (const b of m) {
      expect(b.barcode).toMatch(/^869\d{10}$/);
      expect(isValidEan13(b.barcode)).toBe(true);
    }
  });

  it("her barkod okutulduğunda doğru ürüne eşleşir", () => {
    for (const b of result.barcodes) {
      const r = resolveBarcode(ctx, b.barcode);
      expect(r).toMatchObject({ status: "found", product: { id: b.productId, name: b.name } });
    }
  });

  it("bugünkü stoklar tablodakiyle aynı (Çay kritik, Şampuan bitti), maliyet ve fiyatlar doğru", () => {
    const rows = q<{ name: string; stock_qty: number; avg_cost_kurus: number; sale_price_kurus: number; vat_rate: number; min_stock: number }>(
      "SELECT name, stock_qty, avg_cost_kurus, sale_price_kurus, vat_rate, min_stock FROM products ORDER BY id",
    );
    expect(rows.map((r) => [r.name, r.stock_qty, r.min_stock, r.vat_rate])).toEqual(
      SEED_PRODUCTS.map((p) => [p.name, p.stock, p.minStock, p.vat]),
    );
    const cay = rows.find((r) => r.name === "Çay 1 kg")!;
    expect(cay.stock_qty).toBeLessThanOrEqual(cay.min_stock);
    expect(rows.find((r) => r.name === "Şampuan 500 ml")!.stock_qty).toBe(0);
    expect(rows[0]).toMatchObject({ avg_cost_kurus: 600, sale_price_kurus: 1000 });
  });

  it("stok değişmez kuralı geçer ve başlangıç stokları 'initial' hareketiyle yazılmış", () => {
    expect(findStockMismatches(db)).toEqual([]);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    const initial = q<{ c: number }>("SELECT COUNT(DISTINCT product_id) AS c FROM stock_movements WHERE type='initial'")[0]!.c;
    expect(initial).toBeGreaterThan(20);
  });

  it("14 gün, geçmiş her gün 15–40 satış, 09:00–22:00 arası; bugün sadece şu ana kadar", () => {
    const perDay = q<{ business_date: string; n: number }>(
      "SELECT business_date, COUNT(*) AS n FROM sales GROUP BY business_date ORDER BY business_date",
    );
    expect(perDay).toHaveLength(14);
    expect(perDay[0]!.business_date).toBe("2026-09-23");
    expect(perDay[13]!.business_date).toBe("2026-10-06");
    for (const d of perDay.slice(0, 13)) {
      expect(d.n).toBeGreaterThanOrEqual(15);
      expect(d.n).toBeLessThanOrEqual(40);
    }
    for (const s of q<{ created_at: string; business_date: string }>("SELECT created_at, business_date FROM sales")) {
      const t = new Date(s.created_at);
      expect(getBusinessDate(t)).toBe(s.business_date);
      expect(getIstanbulHour(t)).toBeGreaterThanOrEqual(9);
      expect(getIstanbulHour(t)).toBeLessThan(22);
      expect(t.getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it("sepetler 1–6 kalem; yaklaşık %70 kart / %30 nakit; birkaç indirimli satış", () => {
    const sizes = q<{ n: number }>("SELECT COUNT(*) AS n FROM sale_items GROUP BY sale_id");
    expect(Math.min(...sizes.map((s) => s.n))).toBeGreaterThanOrEqual(1);
    expect(Math.max(...sizes.map((s) => s.n))).toBeLessThanOrEqual(6);
    const pay = q<{ card: number; total: number }>(
      "SELECT SUM(payment_method='card') AS card, COUNT(*) AS total FROM sales",
    )[0]!;
    const ratio = pay.card / pay.total;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.8);
    const discounted = q<{ c: number }>("SELECT COUNT(*) AS c FROM sales WHERE discount_kurus > 0")[0]!.c;
    expect(discounted).toBeGreaterThanOrEqual(3);
  });

  it("2 iptal ve 2 kısmi iade var", () => {
    expect(result.voids).toBe(2);
    expect(result.returns).toBe(2);
    expect(q<{ c: number }>("SELECT COUNT(*) AS c FROM sales WHERE status='voided'")[0]!.c).toBe(2);
    const rets = q<{ qty: number; sold: number }>(
      `SELECT ri.qty, si.qty AS sold FROM return_items ri JOIN sale_items si ON si.id = ri.sale_item_id`,
    );
    expect(rets).toHaveLength(2);
    for (const r of rets) expect(r.qty).toBeLessThan(r.sold); // kısmi
  });

  it("satış toplamları kalemlerle kuruşu kuruşuna tutarlı", () => {
    const bad = q(
      `SELECT s.id FROM sales s JOIN sale_items i ON i.sale_id = s.id
        GROUP BY s.id
       HAVING s.total_kurus <> SUM(i.line_total_kurus)
           OR s.discount_kurus <> SUM(i.line_discount_kurus)
           OR s.net_total_kurus <> SUM(i.line_net_kurus)
           OR s.gross_profit_kurus <> SUM(i.line_profit_kurus)
           OR s.subtotal_kurus <> SUM(i.unit_price_kurus * i.qty)`,
    );
    expect(bad).toEqual([]);
  });

  it("aynı tarihle tekrar çalıştırıldığında aynı veriyi üretir", () => {
    const db2 = openMemoryDatabase();
    const r2 = runSeed(db2, { now: NOW });
    expect(r2.sales).toBe(result.sales);
    expect(r2.barcodes).toEqual(result.barcodes);
  });

  it("dolu veritabanına uygulanamaz", () => {
    expect(() => runSeed(db, { now: NOW })).toThrow(/boş veritabanı/);
  });

  it("CSV: BOM, ; ayraç, başlık + her barkod bir satır", () => {
    const csv = barcodesToCsv(result.barcodes);
    expect(csv.startsWith("﻿No;Ürün;Kategori;Barkod;Tür;Birincil")).toBe(true);
    expect(csv.trim().split("\r\n")).toHaveLength(result.barcodes.length + 1);
  });
});

describe("seed farklı tarih ve saatlerde", () => {
  it("30 farklı 'şimdi' için plan tutarlı: stoklar tabloyla aynı, bütünlük bozulmuyor", () => {
    const base = new Date("2026-01-01T04:00:00.000Z").getTime();
    for (let i = 0; i < 30; i++) {
      // Günün farklı saatleri (sabah 07:00 → açılıştan önce, gece 23:xx dahil) ve yılın farklı günleri
      const now = new Date(base + i * 11 * 86_400_000 + (i % 6) * 3 * 3_600_000 + i * 7 * 60_000);
      const db = openMemoryDatabase();
      const r = runSeed(db, { now, randomSeed: 1000 + i });
      expect([r.voids, r.returns]).toEqual([2, 2]);
      expect(findStockMismatches(db)).toEqual([]);
      const stocks = (db.prepare("SELECT stock_qty FROM products ORDER BY id").all() as { stock_qty: number }[]).map(
        (r) => r.stock_qty,
      );
      expect(stocks).toEqual(SEED_PRODUCTS.map((p) => p.stock));
      db.close();
    }
  }, 60_000); // 30 tam seed: yavaş makinelerde (GitHub Windows) 5 sn'yi aşabiliyor
});
