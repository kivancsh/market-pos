/**
 * Analizler (Yönetici Paneli → Analizler):
 * - Son 12 haftanın cirosu ve kârı (hafta Pazartesi başlar)
 * - Gün × saat yoğunluğu (son 30 / 90 gün): hangi gün hangi saatte satış oluyor
 * - ABC analizi: cironun %80'ini getiren ürünler (A), sonraki %15 (B), kalan (C)
 * - Stok yeterliliği ve sipariş önerisi: son 30 günün satış hızına göre stok kaç gün yeter, 14 gün yetecek kadar ne alınmalı
 * Bütün hesaplar tam sayıyla (float yok).
 */
import { addDays, getBusinessDate, getIstanbulHour, startOfWeek } from "@/lib/businessDate";
import { mulDivRound } from "@/lib/money";
import type { Ctx } from "../context";
import { getPeriodSummary, getProductAggregates, getSaleTimes, listStockPlanRows } from "../db/repositories/reports";
import { todayOf } from "./dayClosing";

export const ANALYSIS_WINDOWS = [30, 90] as const;
export type AnalysisWindow = (typeof ANALYSIS_WINDOWS)[number];

/** Sipariş önerisi: kaç günlük satışa yetecek kadar stok hedeflenir. */
export const COVER_TARGET_DAYS = 14;
const SALES_WINDOW_DAYS = 30;

/** Pazartesi = 0 … Pazar = 6 */
export function weekdayIndex(businessDate: string): number {
  return (new Date(`${businessDate}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export type StockStatus = "bitti" | "acil" | "yakinda" | "yeterli" | "hareketsiz";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  bitti: "Bitti",
  acil: "1 hafta içinde biter",
  yakinda: "2 hafta içinde biter",
  yeterli: "Yeterli",
  hareketsiz: "Satılmıyor",
};

export interface StockPlan {
  id: number;
  name: string;
  categoryName: string | null;
  stockQty: number;
  minStock: number;
  soldLast30: number;
  /** Günlük ortalama satış ×10 (ör. 15 = 1,5 adet/gün) */
  dailyAvgTenths: number;
  daysCover: number | null;
  suggestQty: number;
  suggestCostKurus: number;
  status: StockStatus;
}

/** Stok yeterliliği ve sipariş önerisi (bütün aktif ürünler; acil olan önce). */
export function getStockPlan(ctx: Ctx): StockPlan[] {
  const today = todayOf(ctx);
  const sold = new Map(getProductAggregates(ctx.db, addDays(today, -(SALES_WINDOW_DAYS - 1)), today).map((p) => [p.productId, Math.max(0, p.qty)]));
  const order: Record<StockStatus, number> = { bitti: 0, acil: 1, yakinda: 2, yeterli: 3, hareketsiz: 4 };
  return listStockPlanRows(ctx.db)
    .map((r): StockPlan => {
      const q = sold.get(r.id) ?? 0;
      const stock = Math.max(0, r.stockQty);
      const daysCover = q > 0 ? Math.floor((stock * SALES_WINDOW_DAYS) / q) : null;
      const status: StockStatus = stock <= 0 ? "bitti" : q === 0 ? "hareketsiz" : daysCover! <= 7 ? "acil" : daysCover! <= COVER_TARGET_DAYS ? "yakinda" : "yeterli";
      // 14 günlük ihtiyaç (yukarı yuvarlanmış) − eldeki stok; asgari stoğun altına düşmesin
      const need = q > 0 ? Math.ceil((q * COVER_TARGET_DAYS) / SALES_WINDOW_DAYS) : 0;
      const suggestQty = Math.max(0, need - stock, r.minStock - stock);
      return {
        id: r.id,
        name: r.name,
        categoryName: r.categoryName,
        stockQty: r.stockQty,
        minStock: r.minStock,
        soldLast30: q,
        dailyAvgTenths: mulDivRound(q, 10, SALES_WINDOW_DAYS),
        daysCover,
        suggestQty,
        suggestCostKurus: suggestQty * r.avgCostKurus,
        status,
      };
    })
    .sort((a, b) => order[a.status] - order[b.status] || (a.daysCover ?? 1e9) - (b.daysCover ?? 1e9) || a.name.localeCompare(b.name, "tr"));
}

export function formatDailyAvg(tenths: number): string {
  return `${Math.floor(tenths / 10)},${tenths % 10}`;
}

export function getAnalytics(ctx: Ctx, days: AnalysisWindow) {
  const today = todayOf(ctx);
  const from = addDays(today, -(days - 1));

  // Son 12 hafta
  const weeks: { from: string; to: string; revenueGrossKurus: number; grossProfitKurus: number; saleCount: number }[] = [];
  let ws = startOfWeek(today);
  for (let i = 0; i < 12; i++) {
    const we = addDays(ws, 6) > today ? today : addDays(ws, 6);
    const s = getPeriodSummary(ctx.db, ws, we);
    weeks.unshift({ from: ws, to: we, revenueGrossKurus: s.revenueGrossKurus, grossProfitKurus: s.grossProfitKurus, saleCount: s.saleCount });
    ws = addDays(ws, -7);
  }

  // Gün × saat yoğunluğu
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ saleCount: 0, totalKurus: 0 })));
  for (const s of getSaleTimes(ctx.db, from, today)) {
    const at = new Date(s.createdAt);
    const cell = heat[weekdayIndex(getBusinessDate(at))]![getIstanbulHour(at)]!;
    cell.saleCount += 1;
    cell.totalKurus += s.totalKurus;
  }
  const activeHours = Array.from({ length: 24 }, (_, h) => h).filter((h) => heat.some((d) => d[h]!.saleCount > 0));
  const hours = activeHours.length ? Array.from({ length: activeHours.at(-1)! - activeHours[0]! + 1 }, (_, i) => activeHours[0]! + i) : [];

  // ABC analizi (ciroya göre)
  const products = getProductAggregates(ctx.db, from, today)
    .filter((p) => p.revenueGrossKurus > 0)
    .sort((a, b) => b.revenueGrossKurus - a.revenueGrossKurus);
  const total = products.reduce((a, p) => a + p.revenueGrossKurus, 0);
  let cum = 0;
  const abc = products.map((p) => {
    const before = cum;
    cum += p.revenueGrossKurus;
    const cls: "A" | "B" | "C" = before * 1000 < total * 800 ? "A" : before * 1000 < total * 950 ? "B" : "C";
    return { ...p, cls, sharePermille: total > 0 ? mulDivRound(p.revenueGrossKurus, 1000, total) : 0 };
  });
  const abcSummary = (["A", "B", "C"] as const).map((c) => {
    const items = abc.filter((p) => p.cls === c);
    const rev = items.reduce((a, p) => a + p.revenueGrossKurus, 0);
    return { cls: c, count: items.length, revenueGrossKurus: rev, sharePermille: total > 0 ? mulDivRound(rev, 1000, total) : 0 };
  });

  return { days, from, to: today, weeks, heat, hours, abc, abcSummary, stock: getStockPlan(ctx) };
}
export type Analytics = ReturnType<typeof getAnalytics>;
