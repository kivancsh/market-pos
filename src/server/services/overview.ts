/**
 * Yönetici Paneli "Genel bakış": seçilen dönemin (bugün / bu hafta / bu ay) özeti ve önceki eş dönemle kıyas,
 * son 30 günün ciro ve kârı, kasiyerler, stok uyarıları, gün durumu ve son işlemler.
 */
import { addDays, startOfMonth, startOfWeek } from "@/lib/businessDate";
import type { Ctx } from "../context";
import { listAudit } from "../db/repositories/audit";
import { expenseTotals } from "../db/repositories/expenses";
import { listProducts } from "../db/repositories/products";
import { getCashierAggregates, getDailyRows, getPeriodSummary, getStockAlerts } from "../db/repositories/reports";
import { listUsers } from "../db/repositories/users";
import { getDayClosingView, todayOf } from "./dayClosing";

export const OVERVIEW_PERIODS = ["bugun", "hafta", "ay"] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

export function isOverviewPeriod(v: unknown): v is OverviewPeriod {
  return typeof v === "string" && (OVERVIEW_PERIODS as readonly string[]).includes(v);
}

/** Dönem ve kıyaslanacak önceki eş dönem (aynı uzunlukta: dün / geçen haftanın aynı günleri / geçen ayın aynı günleri). */
export function periodRanges(period: OverviewPeriod, today: string) {
  if (period === "bugun") return { from: today, to: today, prevFrom: addDays(today, -1), prevTo: addDays(today, -1) };
  if (period === "hafta") {
    const from = startOfWeek(today);
    return { from, to: today, prevFrom: addDays(from, -7), prevTo: addDays(today, -7) };
  }
  const from = startOfMonth(today);
  const prevFrom = startOfMonth(addDays(from, -1));
  const span = Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000);
  const prevEnd = addDays(prevFrom, span);
  const prevMonthEnd = addDays(from, -1);
  return { from, to: today, prevFrom, prevTo: prevEnd > prevMonthEnd ? prevMonthEnd : prevEnd };
}

export function getOverview(ctx: Ctx, period: OverviewPeriod) {
  const today = todayOf(ctx);
  const r = periodRanges(period, today);
  const trendDays: string[] = [];
  for (let d = addDays(today, -29); d <= today; d = addDays(d, 1)) trendDays.push(d);
  const users = listUsers(ctx.db);
  return {
    period,
    today,
    range: { from: r.from, to: r.to },
    summary: getPeriodSummary(ctx.db, r.from, r.to),
    previous: getPeriodSummary(ctx.db, r.prevFrom, r.prevTo),
    /** Giderler (KDV hariç) — net kâr = brüt kâr − gider */
    expensesNetKurus: expenseTotals(ctx.db, r.from, r.to).netKurus,
    previousExpensesNetKurus: expenseTotals(ctx.db, r.prevFrom, r.prevTo).netKurus,
    trend: getDailyRows(ctx.db, trendDays).map((d) => ({
      date: d.businessDate,
      revenueGrossKurus: d.revenueGrossKurus,
      grossProfitKurus: d.grossProfitKurus,
    })),
    cashiers: getCashierAggregates(ctx.db, r.from, r.to),
    stock: getStockAlerts(ctx.db),
    day: getDayClosingView(ctx, today),
    recent: listAudit(ctx.db, { from: addDays(today, -30), to: today, limit: 6, offset: 0 }).items,
    counts: {
      products: listProducts(ctx.db, { activeOnly: true }).length,
      cashiers: users.filter((u) => u.role === "cashier" && u.isActive).length,
    },
  };
}
export type Overview = ReturnType<typeof getOverview>;
