/**
 * Raporlar. Her rapor sütunlarını ve satırlarını tek yerde tanımlar; ekrandaki tablo ve Excel dosyası
 * aynı tanımdan üretilir (ikisi her zaman aynı veriyi gösterir).
 */
import { addDays, isBusinessDate } from "@/lib/businessDate";
import { marginPermille } from "@/lib/money";
import { unitEconomics } from "@/lib/pricing";
import type { Ctx } from "../context";
import {
  getDailyRows,
  getLastSaleDates,
  getPeriodSummary,
  getProductAggregates,
  listActiveProductRows,
} from "../db/repositories/reports";
import { badRequest, notFound } from "../errors";
import { todayOf } from "./dayClosing";

export type ColumnType = "text" | "int" | "money" | "permille" | "date";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export type ReportRow = Record<string, string | number | null>;

export interface ReportResult {
  key: ReportKey;
  title: string;
  description: string;
  from: string;
  to: string;
  /** Rapor tarih aralığına bağlı mı? (stok değeri, satmayanlar bugüne göredir) */
  usesRange: boolean;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow | null;
}

export const REPORT_KEYS = ["daily", "products", "categories", "low-margin", "dead-stock", "stock-value"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const MAX_RANGE_DAYS = 366;
export const LOW_MARGIN_PERMILLE = 100; // %10
export const DEAD_STOCK_DAYS = 30;

export function parseRange(ctx: Ctx, from: string | null, to: string | null): { from: string; to: string } {
  const today = todayOf(ctx);
  const f = from ?? today;
  const t = to ?? today;
  if (!isBusinessDate(f) || !isBusinessDate(t)) throw badRequest("BAD_DATE", "Geçersiz tarih.");
  if (f > t) throw badRequest("BAD_RANGE", "Başlangıç tarihi bitişten sonra olamaz.");
  if (addDays(f, MAX_RANGE_DAYS - 1) < t) throw badRequest("RANGE_TOO_LONG", "En fazla 366 günlük aralık seçilebilir.");
  return { from: f, to: t };
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const sum = (rows: ReportRow[], key: string) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

type Builder = (ctx: Ctx, from: string, to: string) => Omit<ReportResult, "key" | "from" | "to">;

const BUILDERS: Record<ReportKey, Builder> = {
  daily: (ctx, from, to) => {
    const rows = getDailyRows(ctx.db, daysBetween(from, to)).map((r) => ({ ...r }));
    const s = getPeriodSummary(ctx.db, from, to);
    return {
      title: "Günlük özet",
      description: "Gün gün ciro, kâr ve satış sayısı. İadeler yapıldığı günden düşülür; iptaller dahil değildir.",
      usesRange: true,
      columns: [
        { key: "businessDate", label: "Tarih", type: "date" },
        { key: "saleCount", label: "Satış sayısı", type: "int" },
        { key: "revenueGrossKurus", label: "Ciro (KDV dahil)", type: "money" },
        { key: "revenueNetKurus", label: "Ciro (KDV hariç)", type: "money" },
        { key: "grossProfitKurus", label: "Brüt kâr (KDV hariç)", type: "money" },
        { key: "marginPermille", label: "Marj", type: "permille" },
        { key: "returnCount", label: "İade sayısı", type: "int" },
        { key: "refundsKurus", label: "İade tutarı", type: "money" },
      ],
      rows,
      totals: {
        businessDate: "Toplam",
        saleCount: s.saleCount,
        revenueGrossKurus: s.revenueGrossKurus,
        revenueNetKurus: s.revenueNetKurus,
        grossProfitKurus: s.grossProfitKurus,
        marginPermille: s.marginPermille,
        returnCount: s.returnCount,
        refundsKurus: s.refundsKurus,
      },
    };
  },

  products: (ctx, from, to) => {
    const rows = getProductAggregates(ctx.db, from, to)
      .sort((a, b) => b.grossProfitKurus - a.grossProfitKurus || a.name.localeCompare(b.name, "tr"))
      .map((p) => ({
        name: p.name,
        categoryName: p.categoryName ?? "Kategorisiz",
        qty: p.qty,
        revenueGrossKurus: p.revenueGrossKurus,
        revenueNetKurus: p.revenueNetKurus,
        grossProfitKurus: p.grossProfitKurus,
        marginPermille: p.marginPermille,
      }));
    const net = sum(rows, "revenueNetKurus");
    const profit = sum(rows, "grossProfitKurus");
    return {
      title: "Ürün bazında kârlılık",
      description: "Seçilen dönemde satılan ürünler (iadeler düşülmüş), kâra göre sıralı.",
      usesRange: true,
      columns: [
        { key: "name", label: "Ürün", type: "text" },
        { key: "categoryName", label: "Kategori", type: "text" },
        { key: "qty", label: "Adet", type: "int" },
        { key: "revenueGrossKurus", label: "Ciro (KDV dahil)", type: "money" },
        { key: "revenueNetKurus", label: "Ciro (KDV hariç)", type: "money" },
        { key: "grossProfitKurus", label: "Brüt kâr (KDV hariç)", type: "money" },
        { key: "marginPermille", label: "Marj", type: "permille" },
      ],
      rows,
      totals: {
        name: "Toplam",
        categoryName: "",
        qty: sum(rows, "qty"),
        revenueGrossKurus: sum(rows, "revenueGrossKurus"),
        revenueNetKurus: net,
        grossProfitKurus: profit,
        marginPermille: marginPermille(profit, net),
      },
    };
  },

  categories: (ctx, from, to) => {
    const acc = new Map<string, { qty: number; gross: number; net: number; profit: number; products: number }>();
    for (const p of getProductAggregates(ctx.db, from, to)) {
      const k = p.categoryName ?? "Kategorisiz";
      const a = acc.get(k) ?? { qty: 0, gross: 0, net: 0, profit: 0, products: 0 };
      acc.set(k, { qty: a.qty + p.qty, gross: a.gross + p.revenueGrossKurus, net: a.net + p.revenueNetKurus, profit: a.profit + p.grossProfitKurus, products: a.products + 1 });
    }
    const rows = [...acc]
      .map(([categoryName, a]) => ({
        categoryName,
        products: a.products,
        qty: a.qty,
        revenueGrossKurus: a.gross,
        revenueNetKurus: a.net,
        grossProfitKurus: a.profit,
        marginPermille: marginPermille(a.profit, a.net),
      }))
      .sort((a, b) => b.grossProfitKurus - a.grossProfitKurus);
    const net = sum(rows, "revenueNetKurus");
    const profit = sum(rows, "grossProfitKurus");
    return {
      title: "Kategori bazında kârlılık",
      description: "Seçilen dönemde kategorilerin ciro ve kârı (iadeler düşülmüş).",
      usesRange: true,
      columns: [
        { key: "categoryName", label: "Kategori", type: "text" },
        { key: "products", label: "Satılan ürün çeşidi", type: "int" },
        { key: "qty", label: "Adet", type: "int" },
        { key: "revenueGrossKurus", label: "Ciro (KDV dahil)", type: "money" },
        { key: "revenueNetKurus", label: "Ciro (KDV hariç)", type: "money" },
        { key: "grossProfitKurus", label: "Brüt kâr (KDV hariç)", type: "money" },
        { key: "marginPermille", label: "Marj", type: "permille" },
      ],
      rows,
      totals: {
        categoryName: "Toplam",
        products: sum(rows, "products"),
        qty: sum(rows, "qty"),
        revenueGrossKurus: sum(rows, "revenueGrossKurus"),
        revenueNetKurus: net,
        grossProfitKurus: profit,
        marginPermille: marginPermille(profit, net),
      },
    };
  },

  "low-margin": (ctx, from, to) => {
    const period = new Map(getProductAggregates(ctx.db, from, to).map((p) => [p.productId, p]));
    const rows = listActiveProductRows(ctx.db)
      .map((p) => {
        const u = unitEconomics(p.salePriceKurus, p.avgCostKurus, p.vatRate);
        const unitMargin = marginPermille(u.profitKurus, u.netPriceKurus);
        const s = period.get(p.id);
        return {
          name: p.name,
          categoryName: p.categoryName ?? "Kategorisiz",
          salePriceKurus: p.salePriceKurus,
          avgCostKurus: p.avgCostKurus,
          unitProfitKurus: u.profitKurus,
          unitMarginPermille: unitMargin,
          periodQty: s?.qty ?? 0,
          periodMarginPermille: s?.marginPermille ?? null,
        };
      })
      .filter(
        (r) =>
          (r.unitMarginPermille !== null && r.unitMarginPermille < LOW_MARGIN_PERMILLE) ||
          (r.periodMarginPermille !== null && r.periodMarginPermille < LOW_MARGIN_PERMILLE),
      )
      .sort((a, b) => (a.unitMarginPermille ?? 0) - (b.unitMarginPermille ?? 0));
    return {
      title: "Düşük marjlı ürünler (marj < %10)",
      description: "Bugünkü fiyat ve ortalama maliyete göre birim marjı %10'un altında olan, ya da seçilen dönemde (indirimler/iadelerle) %10'un altında satılan aktif ürünler.",
      usesRange: true,
      columns: [
        { key: "name", label: "Ürün", type: "text" },
        { key: "categoryName", label: "Kategori", type: "text" },
        { key: "salePriceKurus", label: "Satış fiyatı", type: "money" },
        { key: "avgCostKurus", label: "Ort. maliyet", type: "money" },
        { key: "unitProfitKurus", label: "Birim kâr (KDV hariç)", type: "money" },
        { key: "unitMarginPermille", label: "Birim marj", type: "permille" },
        { key: "periodQty", label: "Dönemde satılan", type: "int" },
        { key: "periodMarginPermille", label: "Dönem marjı", type: "permille" },
      ],
      rows,
      totals: null,
    };
  },

  "dead-stock": (ctx) => {
    const today = todayOf(ctx);
    const since = addDays(today, -(DEAD_STOCK_DAYS - 1));
    const last = getLastSaleDates(ctx.db);
    const rows = listActiveProductRows(ctx.db)
      .filter((p) => !last.has(p.id) || last.get(p.id)! < since)
      .map((p) => ({
        name: p.name,
        categoryName: p.categoryName ?? "Kategorisiz",
        stockQty: p.stockQty,
        stockCostKurus: Math.max(p.stockQty, 0) * p.avgCostKurus,
        lastSaleDate: last.get(p.id) ?? null,
      }))
      .sort((a, b) => b.stockCostKurus - a.stockCostKurus);
    return {
      title: `Son ${DEAD_STOCK_DAYS} günde hiç satmayan ürünler`,
      description: `${since} – ${today} arasında hiç satılmamış aktif ürünler; rafta bekleyen stoğun maliyetiyle.`,
      usesRange: false,
      columns: [
        { key: "name", label: "Ürün", type: "text" },
        { key: "categoryName", label: "Kategori", type: "text" },
        { key: "stockQty", label: "Stok", type: "int" },
        { key: "stockCostKurus", label: "Stok değeri (maliyet)", type: "money" },
        { key: "lastSaleDate", label: "Son satış", type: "date" },
      ],
      rows,
      totals: { name: "Toplam", categoryName: "", stockQty: sum(rows, "stockQty"), stockCostKurus: sum(rows, "stockCostKurus"), lastSaleDate: null },
    };
  },

  "stock-value": (ctx) => {
    const acc = new Map<string, { qty: number; cost: number; sale: number; products: number }>();
    for (const p of listActiveProductRows(ctx.db)) {
      const qty = Math.max(p.stockQty, 0);
      const k = p.categoryName ?? "Kategorisiz";
      const a = acc.get(k) ?? { qty: 0, cost: 0, sale: 0, products: 0 };
      acc.set(k, { qty: a.qty + qty, cost: a.cost + qty * p.avgCostKurus, sale: a.sale + qty * p.salePriceKurus, products: a.products + 1 });
    }
    const rows = [...acc]
      .map(([categoryName, a]) => ({
        categoryName,
        products: a.products,
        qty: a.qty,
        costValueKurus: a.cost,
        saleValueKurus: a.sale,
        potentialDiffKurus: a.sale - a.cost,
      }))
      .sort((a, b) => b.costValueKurus - a.costValueKurus);
    return {
      title: "Stok değeri",
      description: "Bugünkü stokların maliyet (ortalama maliyet) ve satış fiyatı üzerinden toplam değeri (KDV dahil). Eksi stoklar 0 sayılır.",
      usesRange: false,
      columns: [
        { key: "categoryName", label: "Kategori", type: "text" },
        { key: "products", label: "Ürün çeşidi", type: "int" },
        { key: "qty", label: "Stok adedi", type: "int" },
        { key: "costValueKurus", label: "Maliyet bazında", type: "money" },
        { key: "saleValueKurus", label: "Satış fiyatı bazında", type: "money" },
        { key: "potentialDiffKurus", label: "Fark (KDV dahil)", type: "money" },
      ],
      rows,
      totals: {
        categoryName: "Toplam",
        products: sum(rows, "products"),
        qty: sum(rows, "qty"),
        costValueKurus: sum(rows, "costValueKurus"),
        saleValueKurus: sum(rows, "saleValueKurus"),
        potentialDiffKurus: sum(rows, "potentialDiffKurus"),
      },
    };
  },
};

export function isReportKey(k: string): k is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(k);
}

export function buildReport(ctx: Ctx, key: string, from: string, to: string): ReportResult {
  if (!isReportKey(key)) throw notFound("REPORT_NOT_FOUND", "Rapor bulunamadı.");
  return { key, from, to, ...BUILDERS[key](ctx, from, to) };
}
