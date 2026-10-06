import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProductById } from "@/server/db/repositories/products";
import { getSaleItems } from "@/server/db/repositories/sales";
import { AppError } from "@/server/errors";
import { createReturn } from "@/server/services/returns";
import { completeSale } from "@/server/services/sales";
import { voidSale } from "@/server/services/voids";
import { closeDay, count, createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;
const owner = { role: "owner" as const };

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

function sell(items: { productId: number; qty: number }[], extra: object = {}) {
  return completeSale(env.ctx, { clientRequestId: uuid(), items, paymentMethod: "cash", ...extra }, owner);
}

/** Raporların temel sorgusu: iptal edilmemiş satışlar. */
function completedTotal(date: string): number {
  return (
    env.db
      .prepare("SELECT COALESCE(SUM(total_kurus),0) AS t FROM sales WHERE business_date = ? AND status = 'completed'")
      .get(date) as { t: number }
  ).t;
}

describe("satış iptali", () => {
  it("stok geri gelir, satış iptal olur ve tamamlanan satış toplamlarına girmez", () => {
    const r = sell([{ productId: p.kola.id, qty: 3 }]);
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(45);
    const v = voidSale(env.ctx, r.sale.id, { reason: "Yanlış ürün okutuldu" });
    expect(v.status).toBe("voided");
    expect(v.voidReason).toBe("Yanlış ürün okutuldu");
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(48);
    expect(completedTotal("2026-10-06")).toBe(0);
    const m = env.db.prepare("SELECT qty_change FROM stock_movements WHERE type = 'void'").all();
    expect(m).toEqual([{ qty_change: 3 }]);
  });

  it("gerekçe zorunlu", () => {
    const r = sell([{ productId: p.kola.id, qty: 1 }]);
    expect(catchErr(() => voidSale(env.ctx, r.sale.id, { reason: " " })).status).toBe(400);
  });

  it("iki kez iptal edilemez", () => {
    const r = sell([{ productId: p.kola.id, qty: 1 }]);
    voidSale(env.ctx, r.sale.id, { reason: "deneme" });
    expect(catchErr(() => voidSale(env.ctx, r.sale.id, { reason: "deneme" })).code).toBe("ALREADY_VOIDED");
  });

  it("sadece aynı iş günü iptal edilebilir", () => {
    const r = sell([{ productId: p.kola.id, qty: 1 }]);
    env.setNow("2026-10-07T09:00:00.000Z");
    expect(catchErr(() => voidSale(env.ctx, r.sale.id, { reason: "geç kaldı" })).code).toBe("VOID_ONLY_SAME_DAY");
  });

  it("gün kapatıldıysa iptal edilemez", () => {
    const r = sell([{ productId: p.kola.id, qty: 1 }]);
    closeDay(env, "2026-10-06");
    expect(catchErr(() => voidSale(env.ctx, r.sale.id, { reason: "deneme" })).code).toBe("DAY_CLOSED");
  });

  it("iade yapılmış satış iptal edilemez", () => {
    const r = sell([{ productId: p.kola.id, qty: 2 }]);
    createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: r.items[0]!.id, qty: 1 }] });
    expect(catchErr(() => voidSale(env.ctx, r.sale.id, { reason: "deneme" })).code).toBe("SALE_HAS_RETURNS");
  });
});

describe("iade", () => {
  it("kısmi iade: stok geri gelir, tutarlar snapshot'tan, iade günü kaydedilir", () => {
    const r = sell([
      { productId: p.kola.id, qty: 3 },
      { productId: p.su.id, qty: 2 },
    ]);
    const kolaItem = r.items.find((i) => i.productId === p.kola.id)!;
    // Ertesi gün iade, bu arada fiyat değişmiş olsa bile snapshot kullanılır
    env.setNow("2026-10-08T10:00:00.000Z");
    env.db.prepare("UPDATE products SET sale_price_kurus = 9999 WHERE id = ?").run(p.kola.id);
    const ret = createReturn(env.ctx, {
      saleId: r.sale.id,
      items: [{ saleItemId: kolaItem.id, qty: 1 }],
      reason: "Bozuk çıktı",
    });
    expect(ret.return.businessDate).toBe("2026-10-08");
    expect(ret.return.refundTotalKurus).toBe(5000);
    // kola satırı: total 15000, net 12500, maliyet net round(9600*100/120)=8000 → 1/3'ü
    expect(ret.return.netTotalKurus).toBe(4167);
    expect(ret.return.costNetTotalKurus).toBe(2667);
    expect(ret.return.profitReversalKurus).toBe(1500);
    expect(ret.return.refundMethod).toBe("cash");
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(46);
    expect(getSaleItems(env.db, r.sale.id).find((i) => i.id === kolaItem.id)!.returnedQty).toBe(1);
  });

  it("parça parça iadelerin toplamı tam iadeye kuruşu kuruşuna eşittir", () => {
    const r = sell([{ productId: p.kola.id, qty: 3 }, { productId: p.su.id, qty: 1 }], {
      cartDiscount: { type: "amount", value: 100 },
    });
    const item = r.items.find((i) => i.productId === p.kola.id)!;
    const parts = [1, 1, 1].map(() =>
      createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: item.id, qty: 1 }] }),
    );
    const sum = (f: (x: (typeof parts)[number]) => number) => parts.reduce((a, x) => a + f(x), 0);
    expect(sum((x) => x.return.refundTotalKurus)).toBe(item.lineTotalKurus);
    expect(sum((x) => x.return.netTotalKurus)).toBe(item.lineNetKurus);
    expect(sum((x) => x.return.costNetTotalKurus)).toBe(item.lineCostNetKurus);
    expect(sum((x) => x.return.profitReversalKurus)).toBe(item.lineProfitKurus);
  });

  it("satılandan fazlası iade edilemez ve hiçbir kayıt yazılmaz", () => {
    const r = sell([{ productId: p.kola.id, qty: 2 }]);
    createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: r.items[0]!.id, qty: 1 }] });
    const before = { returns: count(env, "returns"), moves: count(env, "stock_movements") };
    const e = catchErr(() =>
      createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: r.items[0]!.id, qty: 2 }] }),
    );
    expect(e.code).toBe("RETURN_QTY_EXCEEDED");
    expect({ returns: count(env, "returns"), moves: count(env, "stock_movements") }).toEqual(before);
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(47);
  });

  it("aynı istekte aynı kalem iki kez gelirse toplamı kontrol edilir", () => {
    const r = sell([{ productId: p.kola.id, qty: 2 }]);
    const id = r.items[0]!.id;
    expect(
      catchErr(() =>
        createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: id, qty: 2 }, { saleItemId: id, qty: 1 }] }),
      ).code,
    ).toBe("RETURN_QTY_EXCEEDED");
  });

  it("başka satışa ait kalem iade edilemez", () => {
    const a = sell([{ productId: p.kola.id, qty: 1 }]);
    const b = sell([{ productId: p.su.id, qty: 1 }]);
    expect(
      catchErr(() => createReturn(env.ctx, { saleId: a.sale.id, items: [{ saleItemId: b.items[0]!.id, qty: 1 }] })).code,
    ).toBe("SALE_ITEM_NOT_FOUND");
  });

  it("iptal edilmiş satıştan iade yapılamaz", () => {
    const r = sell([{ productId: p.kola.id, qty: 1 }]);
    voidSale(env.ctx, r.sale.id, { reason: "deneme" });
    expect(
      catchErr(() => createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: r.items[0]!.id, qty: 1 }] })).code,
    ).toBe("SALE_VOIDED");
  });

  it("bugün kapatıldıysa iade yapılamaz (409)", () => {
    const r = sell([{ productId: p.kola.id, qty: 1 }]);
    closeDay(env, "2026-10-06");
    const e = catchErr(() =>
      createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: r.items[0]!.id, qty: 1 }] }),
    );
    expect(e.status).toBe(409);
  });

  it("iade yöntemi seçilebilir (kartla satılan nakit iade edilebilir)", () => {
    const r = completeSale(
      env.ctx,
      { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 1 }], paymentMethod: "card" },
      owner,
    );
    const ret = createReturn(env.ctx, {
      saleId: r.sale.id,
      items: [{ saleItemId: r.items[0]!.id, qty: 1 }],
      refundMethod: "cash",
    });
    expect(ret.return.refundMethod).toBe("cash");
  });
});
