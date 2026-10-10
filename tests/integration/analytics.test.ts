import { beforeEach, describe, expect, it } from "vitest";
import { getAnalytics, getStockPlan, weekdayIndex } from "@/server/services/analytics";
import { buildReport } from "@/server/services/reports";
import { completeSale } from "@/server/services/sales";
import { ensureUsers } from "../apiHelpers";
import { createEnv, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;

beforeEach(() => {
  env = createEnv("2026-10-06T09:00:00.000Z"); // Salı, İstanbul 12:00
  p = seedSample(env);
});

function sell(items: { productId: number; qty: number }[]) {
  const { owner } = ensureUsers(env);
  const ctx = { ...env.ctx, actor: { userId: owner.id, name: owner.name, role: "owner" as const } };
  return completeSale(ctx, { clientRequestId: uuid(), items, paymentMethod: "cash" }, { role: "owner" });
}

describe("analizler", () => {
  it("haftanın günü Pazartesi'den başlar", () => {
    expect(weekdayIndex("2026-10-05")).toBe(0); // Pazartesi
    expect(weekdayIndex("2026-10-11")).toBe(6); // Pazar
  });

  it("stok yeterliliği: satış hızına göre kaç gün yeter, 14 günlük öneri, asgari stok", () => {
    // Kola: stok 48, 30 günde 30 satılırsa günde 1 → 18 kalır → 18 gün yeter → yeterli; Cips: 30 stok, 24 satış → 6 kalır, 7,5 gün… 
    sell([{ productId: p.kola.id, qty: 30 }]);
    sell([{ productId: p.cips.id, qty: 26 }]); // 4 kalır, günde ~0,87 → 4*30/26 = 4 gün → acil
    const plan = getStockPlan(env.ctx);
    const kola = plan.find((x) => x.id === p.kola.id)!;
    expect(kola).toMatchObject({ stockQty: 18, soldLast30: 30, dailyAvgTenths: 10, daysCover: 18, status: "yeterli" });
    expect(kola.suggestQty).toBe(0); // 14 günlük ihtiyaç 14 < 18; asgari stok 12 < 18
    const cips = plan.find((x) => x.id === p.cips.id)!;
    expect(cips).toMatchObject({ stockQty: 4, soldLast30: 26, daysCover: 4, status: "acil" });
    expect(cips.suggestQty).toBe(Math.ceil((26 * 14) / 30) - 4); // 13 − 4 = 9
    // Su: hiç satılmadı → hareketsiz, stok asgari stoğun üstünde → öneri yok
    expect(plan.find((x) => x.id === p.su.id)).toMatchObject({ status: "hareketsiz", suggestQty: 0 });
    // Acil olan önce
    expect(plan[0]!.id).toBe(p.cips.id);
    const report = buildReport(env.ctx, "reorder", "2026-10-06", "2026-10-06");
    expect(report.rows.map((r) => r.name)).toContain(p.cips.name);
    expect(report.rows.map((r) => r.name)).not.toContain(p.kola.name);
  });

  it("ABC ve yoğunluk haritası", () => {
    sell([{ productId: p.kola.id, qty: 10 }]); // 50.000
    sell([{ productId: p.cips.id, qty: 1 }]); // 7.000
    sell([{ productId: p.su.id, qty: 2 }]); // 2.000
    const a = getAnalytics(env.ctx, 30);
    expect(a.abc.map((x) => [x.name, x.cls])).toEqual([
      [p.kola.name, "A"],
      [p.cips.name, "B"],
      [p.su.name, "C"],
    ]);
    // Salı (1), saat 12
    expect(a.heat[1]![12]).toEqual({ saleCount: 3, totalKurus: 59000 });
    expect(a.hours).toEqual([12]);
    expect(a.weeks).toHaveLength(12);
    expect(a.weeks.at(-1)).toMatchObject({ from: "2026-10-05", to: "2026-10-06", revenueGrossKurus: 59000 });
  });
});
