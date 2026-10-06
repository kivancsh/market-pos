import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProductById } from "@/server/db/repositories/products";
import { getSaleItems } from "@/server/db/repositories/sales";
import { saveSettings } from "@/server/db/repositories/settings";
import { AppError } from "@/server/errors";
import { updateProduct } from "@/server/services/products";
import { completeSale } from "@/server/services/sales";
import { closeDay, count, createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;
const owner = { role: "owner" as const };
const cashier = { role: "cashier" as const };

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

describe("satış tamamlama", () => {
  it("başarılı satış: stok düşer, hareket yazılır, toplamlar ve fiş no doğru", () => {
    const r = completeSale(
      env.ctx,
      {
        clientRequestId: uuid(),
        items: [
          { productId: p.kola.id, qty: 2, barcode: p.kola.barcodes[0]!.barcode },
          { productId: p.su.id, qty: 3, barcode: "8690000000005" },
        ],
        paymentMethod: "cash",
        cashReceivedKurus: 20000,
      },
      owner,
    );
    expect(r.duplicate).toBe(false);
    expect(r.sale.receiptNo).toBe("20261006-0001");
    expect(r.sale.businessDate).toBe("2026-10-06");
    expect(r.sale.status).toBe("completed");
    // Kola: 2×50 = 100 TL (%20) → net 8333, maliyet 6400 → net 5333, kâr 3000
    // Su:   3×10 =  30 TL (%1)  → net 2970, maliyet 1800 → net 1782, kâr 1188
    expect(r.sale.subtotalKurus).toBe(13000);
    expect(r.sale.discountKurus).toBe(0);
    expect(r.sale.totalKurus).toBe(13000);
    expect(r.sale.netTotalKurus).toBe(8333 + 2970);
    expect(r.sale.vatTotalKurus).toBe(1667 + 30);
    expect(r.sale.costTotalKurus).toBe(6400 + 1800);
    expect(r.sale.costNetTotalKurus).toBe(5333 + 1782);
    expect(r.sale.grossProfitKurus).toBe(3000 + 1188);
    expect(r.sale.cashReceivedKurus).toBe(20000);
    expect(r.sale.changeKurus).toBe(7000);

    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(46);
    expect(getProductById(env.db, p.su.id)!.stockQty).toBe(117);
    expect(r.items.map((i) => [i.productNameSnapshot, i.barcodeSnapshot, i.unitPriceKurus, i.unitCostKurus])).toEqual([
      ["Kola 1 L", p.kola.barcodes[0]!.barcode, 5000, 3200],
      ["Su 0,5 L", "8690000000005", 1000, 600],
    ]);
    const moves = env.db
      .prepare("SELECT product_id, qty_change, stock_after, ref_id FROM stock_movements WHERE type = 'sale' ORDER BY id")
      .all();
    expect(moves).toEqual([
      { product_id: p.kola.id, qty_change: -2, stock_after: 46, ref_id: r.sale.id },
      { product_id: p.su.id, qty_change: -3, stock_after: 117, ref_id: r.sale.id },
    ]);

    const r2 = completeSale(
      env.ctx,
      { clientRequestId: uuid(), items: [{ productId: p.su.id, qty: 1 }], paymentMethod: "card" },
      cashier,
    );
    expect(r2.sale.receiptNo).toBe("20261006-0002");
    expect(r2.sale.cashReceivedKurus).toBeNull();
    expect(r2.sale.changeKurus).toBeNull();
    expect(r2.sale.createdByRole).toBe("cashier");
  });

  it("fiş numarası her iş günü 0001'den başlar; İstanbul gece yarısından sonra ertesi güne düşer", () => {
    completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.su.id, qty: 1 }], paymentMethod: "card" }, owner);
    env.setNow("2026-10-06T21:05:00.000Z"); // İstanbul 7 Ekim 00:05
    const r = completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.su.id, qty: 1 }], paymentMethod: "card" }, owner);
    expect(r.sale.businessDate).toBe("2026-10-07");
    expect(r.sale.receiptNo).toBe("20261007-0001");
  });

  it("yetersiz stok: satış reddedilir ve HİÇBİR kayıt yazılmaz", () => {
    const before = { sales: count(env, "sales"), items: count(env, "sale_items"), moves: count(env, "stock_movements") };
    const e = catchErr(() =>
      completeSale(
        env.ctx,
        {
          clientRequestId: uuid(),
          items: [
            { productId: p.kola.id, qty: 1 },
            { productId: p.cay.id, qty: 5 },
          ],
          paymentMethod: "card",
        },
        owner,
      ),
    );
    expect(e.status).toBe(409);
    expect(e.code).toBe("INSUFFICIENT_STOCK");
    expect(e.details).toEqual({
      shortages: [{ productId: p.cay.id, name: "Çay 1 kg", requested: 5, available: 3, missing: 2 }],
    });
    expect({ sales: count(env, "sales"), items: count(env, "sale_items"), moves: count(env, "stock_movements") }).toEqual(before);
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(48);
  });

  it("negatif stoğa izin varsa satış yapılır ve uyarı döner", () => {
    saveSettings(env.db, { allowNegativeStock: true });
    const r = completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.cay.id, qty: 5 }], paymentMethod: "card" }, owner);
    expect(r.warnings).toHaveLength(1);
    expect(getProductById(env.db, p.cay.id)!.stockQty).toBe(-2);
  });

  it("aynı clientRequestId ile iki istek → tek satış", () => {
    const id = uuid();
    const input = { clientRequestId: id, items: [{ productId: p.kola.id, qty: 1 }], paymentMethod: "card" as const };
    const a = completeSale(env.ctx, input, owner);
    const b = completeSale(env.ctx, input, owner);
    expect(b.duplicate).toBe(true);
    expect(b.sale.id).toBe(a.sale.id);
    expect(count(env, "sales")).toBe(1);
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(47);
  });

  it("aynı ürün birden çok satırda gelirse adetler birleştirilir", () => {
    const r = completeSale(
      env.ctx,
      {
        clientRequestId: uuid(),
        items: [
          { productId: p.su.id, qty: 1, barcode: "8690000000005" },
          { productId: p.kola.id, qty: 1 },
          { productId: p.su.id, qty: 2 },
        ],
        paymentMethod: "card",
      },
      owner,
    );
    expect(r.items.map((i) => [i.productId, i.qty])).toEqual([
      [p.su.id, 3],
      [p.kola.id, 1],
    ]);
    expect(r.items[0]!.barcodeSnapshot).toBe("8690000000005");
  });

  it("istemciden gelen fiyat/maliyet yok sayılır; fiyat veritabanından okunur", () => {
    const r = completeSale(
      env.ctx,
      {
        clientRequestId: uuid(),
        items: [{ productId: p.kola.id, qty: 1, unitPriceKurus: 1, unitCostKurus: 0 } as never],
        paymentMethod: "card",
      },
      owner,
    );
    expect(r.items[0]!.unitPriceKurus).toBe(5000);
    expect(r.sale.totalKurus).toBe(5000);
  });

  it("sepet indirimi kalemlere kuruşu kuruşuna dağıtılır ve toplamlar tutarlıdır", () => {
    const r = completeSale(
      env.ctx,
      {
        clientRequestId: uuid(),
        items: [
          { productId: p.kola.id, qty: 1 },
          { productId: p.cips.id, qty: 1 },
          { productId: p.su.id, qty: 3 },
        ],
        cartDiscount: { type: "percent", value: 7 },
        paymentMethod: "card",
      },
      owner,
    );
    // ara toplam 5000 + 7000 + 3000 = 15000; %7 = 1050
    expect(r.sale.subtotalKurus).toBe(15000);
    expect(r.sale.discountKurus).toBe(1050);
    expect(r.sale.totalKurus).toBe(13950);
    const items = getSaleItems(env.db, r.sale.id);
    expect(items.reduce((a, i) => a + i.lineDiscountKurus, 0)).toBe(1050);
    expect(items.map((i) => i.lineDiscountKurus)).toEqual([350, 490, 210]);
    expect(items.reduce((a, i) => a + i.lineTotalKurus, 0)).toBe(r.sale.totalKurus);
    expect(items.reduce((a, i) => a + i.lineNetKurus, 0)).toBe(r.sale.netTotalKurus);
    expect(items.reduce((a, i) => a + i.lineVatKurus, 0)).toBe(r.sale.vatTotalKurus);
    expect(items.reduce((a, i) => a + i.lineProfitKurus, 0)).toBe(r.sale.grossProfitKurus);
    expect(r.sale.netTotalKurus + r.sale.vatTotalKurus).toBe(r.sale.totalKurus);
    expect(r.sale.netTotalKurus - r.sale.costNetTotalKurus).toBe(r.sale.grossProfitKurus);
  });

  it("ara toplamdan büyük indirim reddedilir", () => {
    const e = catchErr(() =>
      completeSale(
        env.ctx,
        { clientRequestId: uuid(), items: [{ productId: p.su.id, qty: 1 }], cartDiscount: { type: "amount", value: 1001 }, paymentMethod: "card" },
        owner,
      ),
    );
    expect(e.code).toBe("DISCOUNT_TOO_LARGE");
    expect(count(env, "sales")).toBe(0);
  });

  it("kasiyer varsayılan olarak indirim yapamaz; ayar açılınca yapabilir", () => {
    const input = () => ({
      clientRequestId: uuid(),
      items: [{ productId: p.kola.id, qty: 1 }],
      cartDiscount: { type: "amount" as const, value: 500 },
      paymentMethod: "card" as const,
    });
    expect(catchErr(() => completeSale(env.ctx, input(), cashier)).status).toBe(403);
    saveSettings(env.db, { cashierCanDiscount: true });
    expect(completeSale(env.ctx, input(), cashier).sale.totalKurus).toBe(4500);
  });

  it("nakitte alınan para toplamdan az olamaz; boşsa tam tutar sayılır", () => {
    const base = { items: [{ productId: p.kola.id, qty: 1 }], paymentMethod: "cash" as const };
    expect(catchErr(() => completeSale(env.ctx, { ...base, clientRequestId: uuid(), cashReceivedKurus: 4999 }, owner)).code).toBe(
      "INSUFFICIENT_CASH",
    );
    const r = completeSale(env.ctx, { ...base, clientRequestId: uuid() }, owner);
    expect(r.sale.cashReceivedKurus).toBe(5000);
    expect(r.sale.changeKurus).toBe(0);
  });

  it("pasif ürün satılamaz", () => {
    updateProduct(env.ctx, p.kola.id, { isActive: false });
    const e = catchErr(() =>
      completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 1 }], paymentMethod: "card" }, owner),
    );
    expect(e.code).toBe("PRODUCT_INACTIVE");
  });

  it("olmayan ürün reddedilir", () => {
    const e = catchErr(() =>
      completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: 9999, qty: 1 }], paymentMethod: "card" }, owner),
    );
    expect(e.status).toBe(404);
  });

  it("hatalı girdi (boş sepet, sıfır adet, geçersiz uuid) 400 döner", () => {
    expect(catchErr(() => completeSale(env.ctx, { clientRequestId: uuid(), items: [], paymentMethod: "card" }, owner)).status).toBe(400);
    expect(
      catchErr(() => completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.su.id, qty: 0 }], paymentMethod: "card" }, owner))
        .status,
    ).toBe(400);
    expect(
      catchErr(() => completeSale(env.ctx, { clientRequestId: "abc", items: [{ productId: p.su.id, qty: 1 }], paymentMethod: "card" }, owner))
        .status,
    ).toBe(400);
  });

  it("kapanmış güne satış → 409", () => {
    closeDay(env, "2026-10-06");
    const e = catchErr(() =>
      completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.su.id, qty: 1 }], paymentMethod: "card" }, owner),
    );
    expect(e.status).toBe(409);
    expect(e.code).toBe("DAY_CLOSED");
    expect(count(env, "sales")).toBe(0);
  });

  it("gün yeniden açılınca satış yapılabilir", () => {
    closeDay(env, "2026-10-06");
    env.db.prepare("UPDATE day_closings SET reopened_at = ?, reopen_reason = 'test'").run(new Date().toISOString());
    expect(
      completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.su.id, qty: 1 }], paymentMethod: "card" }, owner).duplicate,
    ).toBe(false);
  });

  it("satış sonrası fiyat değişirse eski satışın kârı değişmez", () => {
    const r = completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 2 }], paymentMethod: "card" }, owner);
    updateProduct(env.ctx, p.kola.id, { salePriceKurus: 9900, vatRate: 10 });
    const items = getSaleItems(env.db, r.sale.id);
    expect(items[0]!.unitPriceKurus).toBe(5000);
    expect(items[0]!.vatRate).toBe(20);
    expect(items[0]!.lineProfitKurus).toBe(3000);
    const sale = env.db.prepare("SELECT gross_profit_kurus AS g FROM sales WHERE id = ?").get(r.sale.id) as { g: number };
    expect(sale.g).toBe(3000);
  });

  it("kritik stoğa düşen ürünler yanıtta listelenir", () => {
    const r = completeSale(
      env.ctx,
      { clientRequestId: uuid(), items: [{ productId: p.cay.id, qty: 1 }, { productId: p.kola.id, qty: 1 }], paymentMethod: "card" },
      owner,
    );
    expect(r.lowStock).toEqual([{ productId: p.cay.id, name: "Çay 1 kg", stockQty: 2, minStock: 4 }]);
  });
});
