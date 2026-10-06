import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeInternalEan13 } from "@/lib/barcode";
import { listBarcodesByProduct } from "@/server/db/repositories/barcodes";
import { getProductById } from "@/server/db/repositories/products";
import { AppError } from "@/server/errors";
import {
  addBarcodeToProduct,
  assignInternalBarcode,
  checkBarcodeAvailability,
  generateInternalBarcode,
  generateMissingBarcodes,
  makeBarcodePrimary,
  removeBarcode,
  resolveBarcode,
} from "@/server/services/barcodes";
import { createProduct, getCatalog, updateProduct } from "@/server/services/products";
import { createPurchase } from "@/server/services/purchases";
import { completeSale } from "@/server/services/sales";
import { adjustStock } from "@/server/services/stock";
import { count, createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;

beforeEach(() => {
  env = createEnv();
  p = seedSample(env);
});
afterEach(() => expectIntegrity(env));

function catchErr(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("Hata bekleniyordu");
}

describe("mal girişi", () => {
  it("ağırlıklı ortalama maliyet doğru güncellenir, stok artar, hareket yazılır", () => {
    // Kola: stok 48, ort. 32,00 → 24 adet 35,00 ile giriş: (48*3200 + 24*3500)/72 = 3300
    const r = createPurchase(env.ctx, {
      supplier: "Toptancı A",
      invoiceNo: "F-1",
      items: [{ productId: p.kola.id, qty: 24, unitCostKurus: 3500 }],
    });
    expect(r.totalCostKurus).toBe(84000);
    const kola = getProductById(env.db, p.kola.id)!;
    expect(kola.avgCostKurus).toBe(3300);
    expect(kola.stockQty).toBe(72);
    const m = env.db.prepare("SELECT qty_change, unit_cost_kurus, ref_id FROM stock_movements WHERE type='purchase'").get();
    expect(m).toEqual({ qty_change: 24, unit_cost_kurus: 3500, ref_id: r.purchaseId });
  });

  it("aynı ürün iki satırda gelirse sırayla uygulanır", () => {
    createPurchase(env.ctx, {
      items: [
        { productId: p.cay.id, qty: 3, unitCostKurus: 26000 }, // (3*24000+3*26000)/6 = 25000
        { productId: p.cay.id, qty: 6, unitCostKurus: 25000 }, // (6*25000+6*25000)/12 = 25000
      ],
    });
    const cay = getProductById(env.db, p.cay.id)!;
    expect(cay.stockQty).toBe(12);
    expect(cay.avgCostKurus).toBe(25000);
  });

  it("stok negatifken giriş: yeni maliyet doğrudan alınır", () => {
    env.db.prepare("UPDATE settings SET value='true' WHERE key='allow_negative_stock'").run();
    completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.cay.id, qty: 5 }], paymentMethod: "card" }, { role: "owner" });
    createPurchase(env.ctx, { items: [{ productId: p.cay.id, qty: 10, unitCostKurus: 25500 }] });
    const cay = getProductById(env.db, p.cay.id)!;
    expect(cay.stockQty).toBe(8);
    expect(cay.avgCostKurus).toBe(25500);
  });

  it("satış maliyet snapshot'ı mal girişinden sonra yeni ortalamayı kullanır", () => {
    createPurchase(env.ctx, { items: [{ productId: p.kola.id, qty: 24, unitCostKurus: 3500 }] });
    const r = completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 1 }], paymentMethod: "card" }, { role: "owner" });
    expect(r.items[0]!.unitCostKurus).toBe(3300);
  });

  it("hatalı satır varsa hiçbir şey yazılmaz", () => {
    const before = count(env, "purchases");
    expect(
      catchErr(() =>
        createPurchase(env.ctx, {
          items: [
            { productId: p.kola.id, qty: 1, unitCostKurus: 3000 },
            { productId: 9999, qty: 1, unitCostKurus: 3000 },
          ],
        }),
      ).status,
    ).toBe(404);
    expect(count(env, "purchases")).toBe(before);
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(48);
  });
});

describe("stok sayımı / düzeltme", () => {
  it("fark 'adjustment' hareketi olarak yazılır", () => {
    const r = adjustStock(env.ctx, { productId: p.cips.id, countedQty: 27, note: "Kırık paket" });
    expect(r).toMatchObject({ stockBefore: 30, stockAfter: 27, difference: -3, changed: true });
    const m = env.db.prepare("SELECT qty_change, note FROM stock_movements WHERE type='adjustment'").get();
    expect(m).toEqual({ qty_change: -3, note: "Kırık paket" });
  });
  it("not zorunlu", () => {
    expect(catchErr(() => adjustStock(env.ctx, { productId: p.cips.id, countedQty: 27, note: "  " })).status).toBe(400);
  });
  it("fark yoksa hareket yazılmaz", () => {
    const before = count(env, "stock_movements");
    expect(adjustStock(env.ctx, { productId: p.cips.id, countedQty: 30, note: "Sayım" }).changed).toBe(false);
    expect(count(env, "stock_movements")).toBe(before);
  });
});

describe("barkodlar", () => {
  it("ürün oluşturulurken barkod verilmezse dükkân içi barkod üretilir", () => {
    expect(p.kola.barcodes).toHaveLength(1);
    expect(p.kola.barcodes[0]).toMatchObject({ type: "internal", isPrimary: true });
    expect(p.kola.barcodes[0]!.barcode).toBe(makeInternalEan13(1));
    expect(p.cips.barcodes[0]!.barcode).toBe(makeInternalEan13(2));
    // Su'ya üretici barkodu verildi, dükkân içi üretilmedi
    expect(p.su.barcodes.map((b) => b.barcode)).toEqual(["8690000000005"]);
  });

  it("aynı barkod ikinci ürüne atanamaz", () => {
    const e = catchErr(() => addBarcodeToProduct(env.ctx, p.kola.id, "8690000000005"));
    expect(e.code).toBe("BARCODE_TAKEN");
    expect(e.message).toContain("Su 0,5 L");
    const e2 = catchErr(() =>
      createProduct(env.ctx, { name: "Taklit", salePriceKurus: 100, barcodes: [{ barcode: "8690000000005" }] }),
    );
    expect(e2.code).toBe("BARCODE_TAKEN");
    expect(count(env, "products")).toBe(4);
  });

  it("canlı benzersizlik kontrolü", () => {
    expect(checkBarcodeAvailability(env.ctx, "8690000000005")).toMatchObject({ available: false });
    expect(checkBarcodeAvailability(env.ctx, "8690000000005", p.su.id)).toMatchObject({ available: false });
    expect(checkBarcodeAvailability(env.ctx, "4006381333931")).toEqual({ available: true, code: "4006381333931" });
    expect(checkBarcodeAvailability(env.ctx, "4006381333932")).toMatchObject({ available: false });
  });

  it("hatalı kontrol basamaklı barkod kaydedilemez", () => {
    expect(catchErr(() => addBarcodeToProduct(env.ctx, p.kola.id, "4006381333932")).code).toBe("BARCODE_INVALID");
  });

  it("birden fazla barkod aynı ürüne eşleşir (üretici + dükkân içi)", () => {
    addBarcodeToProduct(env.ctx, p.kola.id, "4006381333931");
    const a = resolveBarcode(env.ctx, p.kola.barcodes[0]!.barcode);
    const b = resolveBarcode(env.ctx, "4006381333931\r\n");
    expect(a).toMatchObject({ status: "found", product: { id: p.kola.id } });
    expect(b).toMatchObject({ status: "found", product: { id: p.kola.id }, barcode: "4006381333931" });
  });

  it("UPC-A (12 hane) başına 0 eklenerek EAN-13 olarak bulunur", () => {
    addBarcodeToProduct(env.ctx, p.cips.id, "0036000291452");
    expect(resolveBarcode(env.ctx, "036000291452")).toMatchObject({ status: "found", product: { id: p.cips.id } });
  });

  it("hatalı okuma, bilinmeyen barkod ve pasif ürün ayrı ayrı bildirilir", () => {
    expect(resolveBarcode(env.ctx, "8690000000006")).toEqual({
      status: "invalid",
      reason: "invalid_check_digit",
      code: "8690000000006",
    });
    expect(resolveBarcode(env.ctx, "4006381333931")).toEqual({ status: "not_found", code: "4006381333931" });
    updateProduct(env.ctx, p.su.id, { isActive: false });
    expect(resolveBarcode(env.ctx, "8690000000005")).toMatchObject({ status: "inactive" });
  });

  it("üretilen barkod zaten kullanılıyorsa sonrakine geçilir", () => {
    const next = makeInternalEan13(5); // seed 3 dükkân içi barkod kullandı (kola, cips, çay → 1,2,3)
    addBarcodeToProduct(env.ctx, p.su.id, makeInternalEan13(4));
    addBarcodeToProduct(env.ctx, p.su.id, next);
    expect(generateInternalBarcode(env.ctx)).toBe(makeInternalEan13(6));
  });

  it("barkodu olmayan tüm ürünlere toplu barkod üretilir", () => {
    const x = createProduct(env.ctx, { name: "Barkodsuz", salePriceKurus: 500, generateBarcodeIfMissing: false });
    expect(x.barcodes).toHaveLength(0);
    const r = generateMissingBarcodes(env.ctx);
    expect(r).toEqual([{ productId: x.id, barcode: makeInternalEan13(4) }]);
    expect(listBarcodesByProduct(env.db, x.id)[0]).toMatchObject({ isPrimary: true, type: "internal" });
    expect(generateMissingBarcodes(env.ctx)).toEqual([]);
  });

  it("birincil barkod değiştirilebilir; birincil silinince kalan barkod birincil olur", () => {
    const extra = assignInternalBarcode(env.ctx, p.su.id);
    expect(extra.isPrimary).toBe(false);
    makeBarcodePrimary(env.ctx, p.su.id, extra.id);
    let list = listBarcodesByProduct(env.db, p.su.id);
    expect(list.filter((b) => b.isPrimary).map((b) => b.id)).toEqual([extra.id]);
    removeBarcode(env.ctx, p.su.id, extra.id);
    list = listBarcodesByProduct(env.db, p.su.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ barcode: "8690000000005", isPrimary: true });
  });
});

describe("katalog", () => {
  it("sadece aktif ürünler, tüm barkodlarıyla; maliyet alanı YOK", () => {
    updateProduct(env.ctx, p.cips.id, { isActive: false });
    const catalog = getCatalog(env.ctx);
    expect(catalog.map((c) => c.id).sort()).toEqual([p.su.id, p.kola.id, p.cay.id].sort());
    for (const item of catalog) {
      expect(Object.keys(item).sort()).toEqual(
        ["barcodes", "id", "minStock", "name", "primaryBarcode", "salePriceKurus", "stockQty", "vatRate"].sort(),
      );
    }
    expect(JSON.stringify(catalog)).not.toMatch(/cost|profit/i);
  });

  it("başlangıç stoğu 'initial' hareketiyle yazılır", () => {
    const m = env.db
      .prepare("SELECT qty_change, unit_cost_kurus FROM stock_movements WHERE type='initial' AND product_id = ?")
      .get(p.kola.id);
    expect(m).toEqual({ qty_change: 48, unit_cost_kurus: 3200 });
  });
});
