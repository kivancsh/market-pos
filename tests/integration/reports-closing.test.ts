import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getHourlySales, getPeriodSummary, getProductAggregates, getStockAlerts, listDaySales } from "@/server/db/repositories/reports";
import { saveSettings } from "@/server/db/repositories/settings";
import { AppError } from "@/server/errors";
import { createBackup, listBackups } from "@/server/services/backup";
import { getDashboard } from "@/server/services/dashboard";
import { closeDay, getDayClosingView, reopenDay } from "@/server/services/dayClosing";
import { createReturn } from "@/server/services/returns";
import { completeSale } from "@/server/services/sales";
import { voidSale } from "@/server/services/voids";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;
beforeEach(() => {
  env = createEnv();
  p = seedSample(env);
});
afterEach(() => expectIntegrity(env));

const owner = { role: "owner" as const };
function sell(items: { productId: number; qty: number }[], payment: "cash" | "card" = "card", extra: object = {}) {
  return completeSale(env.ctx, { clientRequestId: uuid(), items, paymentMethod: payment, ...extra }, owner);
}
function catchErr(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("Hata bekleniyordu");
}
const D = "2026-10-06";

describe("dönem özeti", () => {
  it("satışları toplar; iptal edilen satış HİÇ girmez", () => {
    sell([{ productId: p.kola.id, qty: 2 }], "cash"); // 100 TL, kâr 30,00
    sell([{ productId: p.su.id, qty: 3 }], "card"); // 30 TL, kâr 11,88
    const v = sell([{ productId: p.cips.id, qty: 1 }], "card");
    voidSale(env.ctx, v.sale.id, { reason: "yanlış ürün" });

    const s = getPeriodSummary(env.db, D, D);
    expect(s.saleCount).toBe(2);
    expect(s.voidedCount).toBe(1);
    expect(s.revenueGrossKurus).toBe(13000);
    expect(s.revenueNetKurus).toBe(8333 + 2970);
    expect(s.vatKurus).toBe(1667 + 30);
    expect(s.grossProfitKurus).toBe(3000 + 1188);
    expect(s.costGrossKurus).toBe(6400 + 1800);
    expect(s.vatInclusiveDiffKurus).toBe(13000 - 8200);
    expect(s.marginPermille).toBe(Math.round((4188 * 1000) / 11303));
    expect(s.avgBasketKurus).toBe(6500);
    expect(s.itemsSold).toBe(5);
    expect(s.cash).toEqual({ saleCount: 1, salesKurus: 10000, refundsKurus: 0, netKurus: 10000 });
    expect(s.card).toEqual({ saleCount: 1, salesKurus: 3000, refundsKurus: 0, netKurus: 3000 });
    expect(listDaySales(env.db, D).map((x) => x.status)).toEqual(["voided", "completed", "completed"]);
  });

  it("satış yoksa marj ve ortalama sepet null (bölme hatası yok)", () => {
    const s = getPeriodSummary(env.db, D, D);
    expect(s.marginPermille).toBeNull();
    expect(s.avgBasketKurus).toBeNull();
    expect(s.revenueGrossKurus).toBe(0);
  });

  it("iade, iadenin yapıldığı günün ciro ve kârından düşer; satış günü değişmez", () => {
    const r = sell([{ productId: p.kola.id, qty: 3 }], "cash");
    env.setNow("2026-10-08T09:00:00.000Z");
    const ret = createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: r.items[0]!.id, qty: 1 }], refundMethod: "cash" });
    const saleDay = getPeriodSummary(env.db, D, D);
    const returnDay = getPeriodSummary(env.db, "2026-10-08", "2026-10-08");
    expect(saleDay.revenueGrossKurus).toBe(15000);
    expect(saleDay.grossProfitKurus).toBe(r.sale.grossProfitKurus);
    expect(returnDay.saleCount).toBe(0);
    expect(returnDay.returnCount).toBe(1);
    expect(returnDay.revenueGrossKurus).toBe(-5000);
    expect(returnDay.grossProfitKurus).toBe(-ret.return.profitReversalKurus);
    expect(returnDay.costGrossKurus).toBe(-3200);
    expect(returnDay.itemsSold).toBe(-1);
    expect(returnDay.cash.refundsKurus).toBe(5000);
    // aralık toplamı = satış − iade
    const both = getPeriodSummary(env.db, D, "2026-10-08");
    expect(both.revenueGrossKurus).toBe(10000);
    expect(both.grossProfitKurus).toBe(r.sale.grossProfitKurus - ret.return.profitReversalKurus);
  });

  it("iadelerde KDV dahil maliyet payı da birikimli tutulur (tam iade = satır maliyeti)", () => {
    const r = sell([{ productId: p.cips.id, qty: 3 }], "card", { cartDiscount: { type: "amount", value: 100 } });
    const id = r.items[0]!.id;
    const parts = [1, 1, 1].map(() => createReturn(env.ctx, { saleId: r.sale.id, items: [{ saleItemId: id, qty: 1 }] }));
    expect(parts.reduce((a, x) => a + x.return.costTotalKurus, 0)).toBe(r.items[0]!.lineCostKurus);
    const s = getPeriodSummary(env.db, D, D);
    expect(s.revenueGrossKurus).toBe(0);
    expect(s.grossProfitKurus).toBe(0);
    expect(s.vatInclusiveDiffKurus).toBe(0);
  });

  it("ürün bazında satış − iade; saatlik dağılım İstanbul saatine göre", () => {
    env.setNow("2026-10-06T06:30:00.000Z"); // İstanbul 09:30
    const a = sell([{ productId: p.kola.id, qty: 2 }]);
    env.setNow("2026-10-06T17:10:00.000Z"); // İstanbul 20:10
    sell([{ productId: p.kola.id, qty: 1 }, { productId: p.su.id, qty: 4 }]);
    createReturn(env.ctx, { saleId: a.sale.id, items: [{ saleItemId: a.items[0]!.id, qty: 1 }] });

    const agg = getProductAggregates(env.db, D, D);
    const kola = agg.find((x) => x.productId === p.kola.id)!;
    expect(kola.qty).toBe(2);
    expect(kola.revenueGrossKurus).toBe(10000);
    expect(kola.categoryName).toBe("İçecek");
    const hourly = getHourlySales(env.db, D);
    expect(hourly[9]).toEqual({ hour: 9, saleCount: 1, totalKurus: 10000 });
    expect(hourly[20]).toEqual({ hour: 20, saleCount: 1, totalKurus: 9000 });
    expect(hourly.reduce((x, h) => x + h.saleCount, 0)).toBe(2);
  });

  it("kritik stok ve stoğu bitenler (sadece aktif ürünler)", () => {
    sell([{ productId: p.cay.id, qty: 3 }]);
    const a = getStockAlerts(env.db);
    expect(a.outOfStock.map((x) => x.name)).toEqual(["Çay 1 kg"]);
    expect(a.critical).toEqual([]);
  });

  it("panel: dün ve geçen hafta karşılaştırması, en çok satanlar", () => {
    env.setNow("2026-09-29T09:00:00.000Z"); // geçen haftanın aynı günü
    sell([{ productId: p.su.id, qty: 1 }]);
    env.setNow("2026-10-05T09:00:00.000Z"); // dün
    sell([{ productId: p.su.id, qty: 2 }]);
    env.setNow("2026-10-06T09:00:00.000Z");
    sell([{ productId: p.kola.id, qty: 1 }, { productId: p.su.id, qty: 5 }]);
    const d = getDashboard(env.ctx, D);
    expect(d.compare.yesterday.revenueGrossKurus).toBe(2000);
    expect(d.compare.lastWeek.revenueGrossKurus).toBe(1000);
    expect(d.topByQty.map((x) => [x.name, x.qty])).toEqual([["Su 0,5 L", 5], ["Kola 1 L", 1]]);
    // Su: 5 × (net 9,90 − maliyet net 5,94) = 19,80 · Kola: 41,67 − 26,67 = 15,00
    expect(d.topByProfit.map((x) => [x.name, x.grossProfitKurus])).toEqual([["Su 0,5 L", 1980], ["Kola 1 L", 1500]]);
    expect(d.hourly).toHaveLength(24);
    expect(d.closing.closed).toBe(false);
  });
});

describe("gün sonu kapanışı", () => {
  it("beklenen kasa = açılış + nakit satış − nakit iade; sayılan ve fark kaydedilir", () => {
    saveSettings(env.db, { openingCashKurus: 50000 });
    const a = sell([{ productId: p.kola.id, qty: 2 }], "cash"); // +10000
    sell([{ productId: p.su.id, qty: 1 }], "card"); // nakit değil
    createReturn(env.ctx, { saleId: a.sale.id, items: [{ saleItemId: a.items[0]!.id, qty: 1 }], refundMethod: "cash" }); // −5000
    const c = closeDay(env.ctx, { countedCashKurus: 54900, note: "Sayıldı" });
    expect(c.closed).toBe(true);
    expect(c.expectedCashKurus).toBe(55000);
    expect(c.cashDifferenceKurus).toBe(-100);
    expect(c.openingCashKurus).toBe(50000);
  });

  it("kapanmış güne satış ve iade 409; ikinci kapanış 409; yeniden açınca satış yapılabilir", () => {
    const a = sell([{ productId: p.kola.id, qty: 2 }], "cash");
    closeDay(env.ctx, {});
    expect(catchErr(() => sell([{ productId: p.su.id, qty: 1 }])).code).toBe("DAY_CLOSED");
    expect(catchErr(() => createReturn(env.ctx, { saleId: a.sale.id, items: [{ saleItemId: a.items[0]!.id, qty: 1 }] })).status).toBe(409);
    expect(catchErr(() => voidSale(env.ctx, a.sale.id, { reason: "deneme" })).code).toBe("DAY_CLOSED");
    expect(catchErr(() => closeDay(env.ctx, {})).code).toBe("ALREADY_CLOSED");

    expect(catchErr(() => reopenDay(env.ctx, D, { reason: "" })).status).toBe(400);
    const r = reopenDay(env.ctx, D, { reason: "Unutulan satış" });
    expect(r.closed).toBe(false);
    expect(r.reopenReason).toBe("Unutulan satış");
    sell([{ productId: p.su.id, qty: 1 }], "cash");

    const again = closeDay(env.ctx, { countedCashKurus: 11000 });
    expect(again.closed).toBe(true);
    expect(again.expectedCashKurus).toBe(11000);
    expect(again.history).toHaveLength(1);
    expect(again.history[0]).toMatchObject({ reopenReason: "Unutulan satış", expectedCashKurus: 10000 });
  });

  it("geçmiş bir gün kapatılabilir, ileri tarih kapatılamaz; kapanış ertesi günü etkilemez", () => {
    closeDay(env.ctx, { businessDate: "2026-10-05" });
    expect(getDayClosingView(env.ctx, "2026-10-05").closed).toBe(true);
    expect(catchErr(() => closeDay(env.ctx, { businessDate: "2026-10-07" })).code).toBe("FUTURE_DATE");
    sell([{ productId: p.su.id, qty: 1 }]); // 6 Ekim açık
  });

  it("yedek: tutarlı bir kopya alınır ve listelenir", async () => {
    sell([{ productId: p.su.id, qty: 1 }]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-backup-"));
    try {
      const f1 = await createBackup(env.db, new Date("2026-10-06T19:05:00Z"), dir);
      const f2 = await createBackup(env.db, new Date("2026-10-06T19:05:30Z"), dir);
      expect(path.basename(f1)).toBe("store-20261006-2205.db");
      expect(path.basename(f2)).toBe("store-20261006-2205-2.db");
      expect(listBackups(dir).map((b) => b.name).sort()).toEqual(["store-20261006-2205-2.db", "store-20261006-2205.db"]);
      const Database = (await import("better-sqlite3")).default;
      const copy = new Database(f1, { readonly: true });
      expect((copy.prepare("SELECT COUNT(*) AS n FROM sales").get() as { n: number }).n).toBe(1);
      copy.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
