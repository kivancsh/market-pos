import { addDays, isBusinessDate } from "@/lib/businessDate";
import type { Ctx } from "../context";
import {
  getHourlySales,
  getPeriodSummary,
  getProductAggregates,
  getStockAlerts,
  listDaySales,
  type ProductAggregate,
} from "../db/repositories/reports";
import { badRequest } from "../errors";
import { getDayClosingView, todayOf } from "./dayClosing";

export const TOP_N = 10;

export function parseDateParam(ctx: Ctx, value: string | null): string {
  if (!value) return todayOf(ctx);
  if (!isBusinessDate(value)) throw badRequest("BAD_DATE", "Geçersiz tarih.");
  return value;
}

/** Panel (gün sonu) verisi: seçili gün + karşılaştırma için dün ve geçen haftanın aynı günü. */
export function getDashboard(ctx: Ctx, date: string) {
  const products = getProductAggregates(ctx.db, date, date);
  const top = (key: keyof Pick<ProductAggregate, "qty" | "grossProfitKurus">) =>
    [...products]
      .filter((p) => p[key] > 0)
      .sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name, "tr"))
      .slice(0, TOP_N);
  return {
    date,
    today: todayOf(ctx),
    summary: getPeriodSummary(ctx.db, date, date),
    compare: {
      yesterday: getPeriodSummary(ctx.db, addDays(date, -1), addDays(date, -1)),
      lastWeek: getPeriodSummary(ctx.db, addDays(date, -7), addDays(date, -7)),
    },
    hourly: getHourlySales(ctx.db, date),
    topByQty: top("qty"),
    topByProfit: top("grossProfitKurus"),
    stock: getStockAlerts(ctx.db),
    sales: listDaySales(ctx.db, date),
    closing: getDayClosingView(ctx, date),
  };
}
export type Dashboard = ReturnType<typeof getDashboard>;
