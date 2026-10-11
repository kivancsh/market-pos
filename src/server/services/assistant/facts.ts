/**
 * Aylık analiz (yapay zekâ asistanının "gerçekleri"). Bütün rakamlar burada, tam sayıyla hesaplanır; yapay zekâ yalnızca
 * bunları yorumlar. Kasiyer adları yapay zekâya gitmez: her kişi "Kasiyer 1001" / "Yönetici" takma adıyla geçer.
 */
import { monthLabel, shiftMonth, type TargetProgress } from "@/lib/assistant";
import { addDays, endOfMonth, getBusinessDate, getIstanbulHour } from "@/lib/businessDate";
import { expenseCategoryLabel } from "@/lib/expenses";
import { changePermille, divRound, marginPermille, mulDivRound } from "@/lib/money";
import { netOfVat } from "@/lib/pricing";
import type { Ctx } from "../../context";
import {
  getClosingStats,
  getFirstSaleDate,
  getProductPairs,
  getProductReturns,
  getProductUnitEconomics,
  getPurchaseStats,
  getSellingDays,
  getStockAtEndOf,
  listProductInfo,
  countAuditActions,
  type ClosingStats,
} from "../../db/repositories/assistantData";
import { expenseTotals } from "../../db/repositories/expenses";
import { getCashierAggregates, getDailyRows, getPeriodSummary, getProductAggregates, getSaleTimes, type CashierAggregate } from "../../db/repositories/reports";
import { getSettings } from "../../db/repositories/settings";
import { getStockPlan, weekdayIndex } from "../analytics";
import { todayOf } from "../dayClosing";

export const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export interface KpiSet {
  revenueGrossKurus: number;
  revenueNetKurus: number;
  grossProfitKurus: number;
  marginPermille: number | null;
  expensesNetKurus: number;
  netProfitKurus: number;
  netMarginPermille: number | null;
  saleCount: number;
  avgBasketKurus: number | null;
  /** Fiş başına ürün adedi ×10 */
  itemsPerBasketTenths: number | null;
  discountKurus: number;
  /** İndirim / indirimsiz satış (binde) */
  discountRatePermille: number | null;
  refundsKurus: number;
  returnCount: number;
  voidedCount: number;
  /** Nakit satış payı (binde) */
  cashSharePermille: number | null;
  sellingDays: number;
  avgDailyRevenueKurus: number | null;
}

export interface ProductLine {
  id: number;
  name: string;
  category: string | null;
  qty: number;
  revenueGrossKurus: number;
  grossProfitKurus: number;
  marginPermille: number | null;
  prevQty: number;
  qtyChangePermille: number | null;
}

export interface PriceLine {
  id: number;
  name: string;
  vatRate: number;
  priceKurus: number;
  avgCostKurus: number;
  /** KDV dahil fiyat üzerinden şu anki birim marj (binde) */
  currentMarginPermille: number | null;
  /** Önceki ayın birim marjı (binde) */
  prevMarginPermille: number | null;
  qty: number;
  suggestedPriceKurus: number;
  /** Önerilen fiyatla aynı adet satılırsa aylık ek brüt kâr (KDV hariç) */
  monthlyGainKurus: number;
}

export interface StaffLine {
  /** Yapay zekâya giden takma ad ("Kasiyer 1001", "Yönetici") */
  alias: string;
  role: "owner" | "cashier" | null;
  isActive: boolean;
  saleCount: number;
  salesTotalKurus: number;
  sharePermille: number | null;
  avgBasketKurus: number | null;
  itemsPerSaleTenths: number | null;
  grossProfitKurus: number;
  marginPermille: number | null;
  discountKurus: number;
  discountRatePermille: number | null;
  voidCount: number;
  voidRatePermille: number | null;
  returnCount: number;
  refundRatePermille: number | null;
  activeDays: number;
  /** Kasada geçen saat başına satış (ilk–son satış arası) */
  salesPerHourKurus: number | null;
}

export interface MonthlyFacts {
  version: 1;
  month: string;
  monthLabel: string;
  from: string;
  to: string;
  isPartial: boolean;
  daysInMonth: number;
  elapsedDays: number;
  generatedAt: string;
  businessName: string;
  kpi: KpiSet;
  previous: { month: string; kpi: KpiSet };
  lastYear: { month: string; kpi: KpiSet } | null;
  /** Önceki aya göre değişim (binde) */
  changes: Record<"revenue" | "grossProfit" | "netProfit" | "saleCount" | "avgBasket" | "margin", number | null>;
  trend: { month: string; revenueGrossKurus: number; grossProfitKurus: number; expensesNetKurus: number; netProfitKurus: number; marginPermille: number | null }[];
  /** Bu ayın hedefleri ve gerçekleşme (hedef konduysa) */
  targets: TargetProgress[];
  products: {
    soldCount: number;
    activeCount: number;
    topProfit: ProductLine[];
    topRevenue: ProductLine[];
    worst: ProductLine[];
    risers: ProductLine[];
    fallers: ProductLine[];
    negativeMargin: PriceLine[];
    erosion: PriceLine[];
    lowMarginStars: PriceLine[];
  };
  abc: { cls: "A" | "B" | "C"; count: number; sharePermille: number }[];
  categories: { name: string; revenueGrossKurus: number; grossProfitKurus: number; marginPermille: number | null; sharePermille: number | null; prevRevenueGrossKurus: number; changePermille: number | null }[];
  stock: {
    valueAtCostKurus: number;
    /** Stok değeri / günlük satılan malın maliyeti */
    daysOfInventory: number | null;
    outOfStock: { name: string; dailyAvgTenths: number; lostProfitPerWeekKurus: number }[];
    urgent: { name: string; stockQty: number; daysCover: number | null; suggestQty: number }[];
    reorderCostKurus: number;
    dead: { count: number; valueAtCostKurus: number; items: { name: string; stockQty: number; valueAtCostKurus: number }[] };
    purchases: { count: number; totalKurus: number };
  };
  expenses: {
    totalNetKurus: number;
    previousNetKurus: number;
    avg3NetKurus: number | null;
    ratioPermille: number | null;
    byCategory: { category: string; label: string; netKurus: number; prevNetKurus: number; avg3NetKurus: number | null }[];
  };
  time: {
    weekdays: { day: string; revenueGrossKurus: number; saleCount: number; sharePermille: number | null; avgPerDayKurus: number | null }[];
    hours: { hour: number; saleCount: number; revenueGrossKurus: number; sharePermille: number | null }[];
    peakHours: number[];
    quietHours: number[];
  };
  basket: { pairs: { a: string; b: string; together: number; liftHundredths: number }[]; avgItemsTenths: number | null };
  returns: { ratePermille: number | null; topProducts: { name: string; returnedQty: number; soldQty: number; ratePermille: number | null }[] };
  cash: ClosingStats & { daysWithSalesNotClosed: number; okcDiffPermille: number | null };
  staff: {
    team: { saleCount: number; voidCount: number; salesTotalKurus: number; discountKurus: number; avgBasketKurus: number | null; voidRatePermille: number | null; discountRatePermille: number | null };
    members: StaffLine[];
  };
  priceChanges: number;
  priorActions: { month: string; items: { key: string; title: string; status: "open" | "done" | "skipped" }[] } | null;
  dataQuality: { historyDays: number; notes: string[] };
}

export interface FactsResult {
  facts: MonthlyFacts;
  /** Takma ad → gerçek ad (yalnız ekranda; yapay zekâya gitmez) */
  aliasNames: Record<string, string>;
}

// ------------------------------------------------------------------ yardımcılar

function kpiOf(ctx: Ctx, from: string, to: string): KpiSet {
  const s = getPeriodSummary(ctx.db, from, to);
  const exp = expenseTotals(ctx.db, from, to);
  const sellingDays = getSellingDays(ctx.db, from, to).length;
  const netProfitKurus = s.grossProfitKurus - exp.netKurus;
  const itemsSoldGross = s.itemsSold + s.itemsReturned;
  return {
    revenueGrossKurus: s.revenueGrossKurus,
    revenueNetKurus: s.revenueNetKurus,
    grossProfitKurus: s.grossProfitKurus,
    marginPermille: s.marginPermille,
    expensesNetKurus: exp.netKurus,
    netProfitKurus,
    netMarginPermille: marginPermille(netProfitKurus, s.revenueNetKurus),
    saleCount: s.saleCount,
    avgBasketKurus: s.avgBasketKurus,
    itemsPerBasketTenths: s.saleCount > 0 ? mulDivRound(itemsSoldGross, 10, s.saleCount) : null,
    discountKurus: s.discountKurus,
    discountRatePermille: s.subtotalKurus > 0 ? mulDivRound(s.discountKurus, 1000, s.subtotalKurus) : null,
    refundsKurus: s.refundsKurus,
    returnCount: s.returnCount,
    voidedCount: s.voidedCount,
    cashSharePermille: s.salesTotalKurus > 0 ? mulDivRound(s.cash.salesKurus, 1000, s.salesTotalKurus) : null,
    sellingDays,
    avgDailyRevenueKurus: sellingDays > 0 ? divRound(s.revenueGrossKurus, sellingDays) : null,
  };
}

const share = (part: number, whole: number) => (whole > 0 ? mulDivRound(part, 1000, whole) : null);
/** KDV dahil birim marj (binde): (fiyat − maliyet) / fiyat */
const unitMargin = (price: number, cost: number) => (price > 0 ? mulDivRound(price - cost, 1000, price) : null);
/** Fiyatı 50 kuruşluk basamağa yukarı yuvarlar (₺12,30 → ₺12,50). */
export const roundUpPrice = (kurus: number) => Math.ceil(kurus / 50) * 50;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Kasiyer takma adları: kasiyer → "Kasiyer <No>", yönetici → "Yönetici" (birden çoksa numaralı). */
export function staffAliases(aggs: CashierAggregate[]): Map<CashierAggregate, string> {
  const out = new Map<CashierAggregate, string>();
  const owners = aggs.filter((a) => a.role === "owner");
  let other = 0;
  for (const a of aggs) {
    if (a.role === "owner") out.set(a, owners.length > 1 ? `Yönetici ${owners.indexOf(a) + 1}` : "Yönetici");
    else if (a.cashierNo !== null) out.set(a, `Kasiyer ${a.cashierNo}`);
    else out.set(a, `Kasiyer ${String.fromCharCode(65 + other++)}`);
  }
  return out;
}

// ------------------------------------------------------------------ ana hesap

/**
 * `month` ayının analizini çıkarır. Ay bitmediyse bugüne kadar (ara rapor).
 * `targets` ve `priorActions` dışarıdan verilir (hedef/aksiyon servisi hesaplar).
 */
export function buildMonthlyFacts(
  ctx: Ctx,
  month: string,
  extra: { targets: TargetProgress[]; priorActions: MonthlyFacts["priorActions"] } = { targets: [], priorActions: null },
): FactsResult {
  const today = todayOf(ctx);
  const from = `${month}-01`;
  const monthEnd = endOfMonth(from);
  const isPartial = monthEnd >= today;
  const to = isPartial ? today : monthEnd;
  const daysInMonth = daysBetween(from, monthEnd);
  const elapsedDays = daysBetween(from, to);
  const prevMonth = shiftMonth(month, -1);
  const prevFrom = `${prevMonth}-01`;
  // Ara raporda önceki ayla adil karşılaştırma: önceki ayın aynı gün sayısı
  const prevTo = isPartial ? (addDays(prevFrom, elapsedDays - 1) > endOfMonth(prevFrom) ? endOfMonth(prevFrom) : addDays(prevFrom, elapsedDays - 1)) : endOfMonth(prevFrom);

  const kpi = kpiOf(ctx, from, to);
  const prevKpi = kpiOf(ctx, prevFrom, prevTo);
  const lyMonth = shiftMonth(month, -12);
  const lyKpi = kpiOf(ctx, `${lyMonth}-01`, isPartial ? addDays(`${lyMonth}-01`, elapsedDays - 1) : endOfMonth(`${lyMonth}-01`));
  const firstSale = getFirstSaleDate(ctx.db);
  const historyDays = firstSale ? daysBetween(firstSale, to) : 0;

  // Son 6 ay
  const trend: MonthlyFacts["trend"] = [];
  for (let i = 5; i >= 0; i--) {
    const m = shiftMonth(month, -i);
    const f = `${m}-01`;
    const t = endOfMonth(f) > today ? today : endOfMonth(f);
    if (f > today || (firstSale !== null && endOfMonth(f) < firstSale)) continue; // program kullanılmadan önceki aylar boş
    const k = kpiOf(ctx, f, t);
    trend.push({ month: m, revenueGrossKurus: k.revenueGrossKurus, grossProfitKurus: k.grossProfitKurus, expensesNetKurus: k.expensesNetKurus, netProfitKurus: k.netProfitKurus, marginPermille: k.marginPermille });
  }

  // ---------------------------------------------------------------- ürünler
  const info = listProductInfo(ctx.db);
  const aggs = getProductAggregates(ctx.db, from, to);
  const prevAggs = new Map(getProductAggregates(ctx.db, prevFrom, prevTo).map((p) => [p.productId, p]));
  const econ = getProductUnitEconomics(ctx.db, from, to);
  const prevEcon = getProductUnitEconomics(ctx.db, prevFrom, prevTo);
  const line = (p: (typeof aggs)[number]): ProductLine => {
    const prevQty = prevAggs.get(p.productId)?.qty ?? 0;
    return {
      id: p.productId,
      name: p.name,
      category: p.categoryName,
      qty: p.qty,
      revenueGrossKurus: p.revenueGrossKurus,
      grossProfitKurus: p.grossProfitKurus,
      marginPermille: p.marginPermille,
      prevQty,
      qtyChangePermille: changePermille(p.qty, prevQty),
    };
  };
  const lines = aggs.map(line);
  const byProfit = [...lines].sort((a, b) => b.grossProfitKurus - a.grossProfitKurus);
  const minQtyForTrend = 5;
  const movers = lines.filter((l) => l.prevQty >= minQtyForTrend || l.qty >= minQtyForTrend);
  const risers = movers.filter((l) => l.qty > l.prevQty).sort((a, b) => b.qty - b.prevQty - (a.qty - a.prevQty)).slice(0, 6);
  const fallers = movers.filter((l) => l.qty < l.prevQty).sort((a, b) => a.qty - a.prevQty - (b.qty - b.prevQty)).slice(0, 6);
  // Önceki ay satılıp bu ay hiç satılmayanlar da düşüşe girer
  for (const [id, p] of prevAggs) {
    if (fallers.length >= 6) break;
    if (!econ.has(id) && p.qty >= minQtyForTrend && info.get(id)?.isActive) {
      fallers.push({ id, name: p.name, category: p.categoryName, qty: 0, revenueGrossKurus: 0, grossProfitKurus: 0, marginPermille: null, prevQty: p.qty, qtyChangePermille: -1000 });
    }
  }

  // ABC (ciroya göre)
  const byRevenue = [...lines].filter((l) => l.revenueGrossKurus > 0).sort((a, b) => b.revenueGrossKurus - a.revenueGrossKurus);
  const totalRev = byRevenue.reduce((a, l) => a + l.revenueGrossKurus, 0);
  const cls = new Map<number, "A" | "B" | "C">();
  let cum = 0;
  for (const l of byRevenue) {
    const before = cum;
    cum += l.revenueGrossKurus;
    cls.set(l.id, before * 1000 < totalRev * 800 ? "A" : before * 1000 < totalRev * 950 ? "B" : "C");
  }
  const abc = (["A", "B", "C"] as const).map((c) => {
    const items = byRevenue.filter((l) => cls.get(l.id) === c);
    return { cls: c, count: items.length, sharePermille: share(items.reduce((a, l) => a + l.revenueGrossKurus, 0), totalRev) ?? 0 };
  });

  // Fiyat / maliyet
  const shopUnitMargin = (() => {
    let list = 0;
    let cost = 0;
    for (const e of econ.values()) {
      list += e.listKurus;
      cost += e.costKurus;
    }
    return unitMargin(list, cost) ?? 250;
  })();
  const negativeMargin: PriceLine[] = [];
  const erosion: PriceLine[] = [];
  const lowMarginStars: PriceLine[] = [];
  for (const [id, e] of econ) {
    const p = info.get(id);
    if (!p || !p.isActive || e.qty <= 0) continue;
    const current = unitMargin(p.salePriceKurus, p.avgCostKurus);
    const pe = prevEcon.get(id);
    const prevMargin = pe && pe.qty > 0 ? unitMargin(pe.listKurus, pe.costKurus) : unitMargin(e.listKurus, e.costKurus);
    const mk = (suggested: number, gainShare = 1000): PriceLine => ({
      id,
      name: p.name,
      vatRate: p.vatRate,
      priceKurus: p.salePriceKurus,
      avgCostKurus: p.avgCostKurus,
      currentMarginPermille: current,
      prevMarginPermille: prevMargin,
      qty: e.qty,
      suggestedPriceKurus: suggested,
      monthlyGainKurus: mulDivRound(e.qty * netOfVat(suggested - p.salePriceKurus, p.vatRate), gainShare, 1000),
    });
    if (current !== null && current <= 0) {
      const wanted = Math.max(prevMargin !== null && prevMargin > 0 ? prevMargin : 0, Math.min(shopUnitMargin, 300), 120);
      negativeMargin.push(mk(roundUpPrice(mulDivRound(p.avgCostKurus, 1000, 1000 - wanted))));
      continue;
    }
    if (current !== null && prevMargin !== null && e.qty >= 3 && current < prevMargin - 20 && prevMargin < 900) {
      const suggested = roundUpPrice(mulDivRound(p.avgCostKurus, 1000, 1000 - prevMargin));
      if (suggested > p.salePriceKurus) {
        erosion.push(mk(suggested));
        continue;
      }
    }
    if (cls.get(id) === "A" && current !== null && current < 150) {
      const suggested = roundUpPrice(mulDivRound(p.salePriceKurus, 1040, 1000));
      if (suggested > p.salePriceKurus) lowMarginStars.push(mk(suggested));
    }
  }
  const byGain = (a: PriceLine, b: PriceLine) => b.monthlyGainKurus - a.monthlyGainKurus;

  // Kategoriler
  const catAcc = new Map<string, { rev: number; net: number; profit: number; prev: number }>();
  for (const p of aggs) {
    const k = p.categoryName ?? "Kategorisiz";
    const c = catAcc.get(k) ?? { rev: 0, net: 0, profit: 0, prev: 0 };
    c.rev += p.revenueGrossKurus;
    c.net += p.revenueNetKurus;
    c.profit += p.grossProfitKurus;
    catAcc.set(k, c);
  }
  for (const p of prevAggs.values()) {
    const k = p.categoryName ?? "Kategorisiz";
    const c = catAcc.get(k) ?? { rev: 0, net: 0, profit: 0, prev: 0 };
    c.prev += p.revenueGrossKurus;
    catAcc.set(k, c);
  }
  const categories = [...catAcc]
    .map(([name, c]) => ({
      name,
      revenueGrossKurus: c.rev,
      grossProfitKurus: c.profit,
      marginPermille: marginPermille(c.profit, c.net),
      sharePermille: share(c.rev, kpi.revenueGrossKurus),
      prevRevenueGrossKurus: c.prev,
      changePermille: changePermille(c.rev, c.prev),
    }))
    .sort((a, b) => b.revenueGrossKurus - a.revenueGrossKurus);

  // ---------------------------------------------------------------- stok
  const plan = getStockPlan(ctx);
  const stockEnd = isPartial ? null : getStockAtEndOf(ctx.db, to);
  let valueAtCost = 0;
  for (const p of info.values()) {
    if (!p.isActive) continue;
    const q = stockEnd ? (stockEnd.get(p.id) ?? 0) : p.stockQty;
    if (q > 0) valueAtCost += q * p.avgCostKurus;
  }
  // Günlük satılan malın maliyeti (KDV dahil; stok değeri de KDV dahil maliyetle)
  const dailyCogs = divRound(Math.max(0, getPeriodSummary(ctx.db, from, to).costGrossKurus), elapsedDays);
  const unitProfitNet = (id: number) => {
    const p = info.get(id);
    return p ? netOfVat(Math.max(0, p.salePriceKurus - p.avgCostKurus), p.vatRate) : 0;
  };
  const dead = plan.filter((p) => p.status === "hareketsiz" && p.stockQty > 0).map((p) => ({ name: p.name, stockQty: p.stockQty, valueAtCostKurus: p.stockQty * (info.get(p.id)?.avgCostKurus ?? 0) }));
  dead.sort((a, b) => b.valueAtCostKurus - a.valueAtCostKurus);

  // ---------------------------------------------------------------- giderler
  const exp = expenseTotals(ctx.db, from, to);
  const prevExp = expenseTotals(ctx.db, prevFrom, endOfMonth(prevFrom));
  const last3 = [1, 2, 3].map((i) => {
    const f = `${shiftMonth(month, -i)}-01`;
    return expenseTotals(ctx.db, f, endOfMonth(f));
  });
  const months3WithData = last3.filter((e) => e.netKurus > 0);
  const avg3 = months3WithData.length ? divRound(months3WithData.reduce((a, e) => a + e.netKurus, 0), months3WithData.length) : null;
  const catKeys = new Set([...exp.byCategory.map((c) => c.category), ...prevExp.byCategory.map((c) => c.category)]);
  const expByCategory = [...catKeys]
    .map((category) => {
      const cur = exp.byCategory.find((c) => c.category === category)?.netKurus ?? 0;
      const prev = prevExp.byCategory.find((c) => c.category === category)?.netKurus ?? 0;
      const vals = months3WithData.map((e) => e.byCategory.find((c) => c.category === category)?.netKurus ?? 0);
      return { category, label: expenseCategoryLabel(category), netKurus: cur, prevNetKurus: prev, avg3NetKurus: vals.length ? divRound(vals.reduce((a, v) => a + v, 0), vals.length) : null };
    })
    .sort((a, b) => b.netKurus - a.netKurus);

  // ---------------------------------------------------------------- zaman
  const wd = Array.from({ length: 7 }, () => ({ rev: 0, n: 0 }));
  const hr = Array.from({ length: 24 }, () => ({ rev: 0, n: 0 }));
  for (const s of getSaleTimes(ctx.db, from, to)) {
    const at = new Date(s.createdAt);
    const w = wd[weekdayIndex(getBusinessDate(at))]!;
    w.rev += s.totalKurus;
    w.n += 1;
    const h = hr[getIstanbulHour(at)]!;
    h.rev += s.totalKurus;
    h.n += 1;
  }
  const dayCount = Array.from({ length: 7 }, () => 0);
  for (const d of getDailyRows(ctx.db, Array.from({ length: elapsedDays }, (_, i) => addDays(from, i)))) dayCount[weekdayIndex(d.businessDate)]! += 1;
  const wdTotal = wd.reduce((a, w) => a + w.rev, 0);
  const hrTotal = hr.reduce((a, h) => a + h.rev, 0);
  const activeHours = hr.map((h, i) => ({ hour: i, ...h })).filter((h) => h.n > 0);
  const sortedHours = [...activeHours].sort((a, b) => b.rev - a.rev);
  const quiet = activeHours.filter((h) => hrTotal > 0 && h.rev * 1000 < hrTotal * 25).map((h) => h.hour);

  // ---------------------------------------------------------------- sepet
  const pairs = getProductPairs(ctx.db, from, to, 3, 8).map((p) => {
    const ca = econ.get(p.a)?.saleCount ?? 0;
    const cb = econ.get(p.b)?.saleCount ?? 0;
    return {
      a: info.get(p.a)?.name ?? `#${p.a}`,
      b: info.get(p.b)?.name ?? `#${p.b}`,
      together: p.together,
      liftHundredths: ca > 0 && cb > 0 ? mulDivRound(p.together * kpi.saleCount, 100, ca * cb) : 0,
    };
  });

  // ---------------------------------------------------------------- iadeler
  const rets = getProductReturns(ctx.db, from, to);
  const topReturns = [...rets]
    .map(([id, r]) => {
      const sold = econ.get(id)?.qty ?? 0;
      return { name: info.get(id)?.name ?? `#${id}`, returnedQty: r.qty, soldQty: sold, ratePermille: share(r.qty, sold) };
    })
    .sort((a, b) => b.returnedQty - a.returnedQty)
    .slice(0, 5);

  // ---------------------------------------------------------------- kasa
  const closing = getClosingStats(ctx.db, from, to);
  const sellingDays = getSellingDays(ctx.db, from, to);
  const closedSet = new Set(closing.closedDates);
  const notClosed = sellingDays.filter((d) => d < today && !closedSet.has(d)).length;
  const { closedDates: _closedDates, ...closingStats } = closing;
  void _closedDates;

  // ---------------------------------------------------------------- personel
  const staffAggs = getCashierAggregates(ctx.db, from, to).filter((a) => a.saleCount + a.voidCount + a.returnCount > 0);
  const aliases = staffAliases(staffAggs);
  const aliasNames: Record<string, string> = {};
  const totalStaffSales = staffAggs.reduce((a, s) => a + s.salesTotalKurus, 0);
  const members: StaffLine[] = staffAggs.map((a) => {
    const alias = aliases.get(a)!;
    aliasNames[alias] = a.name;
    return {
      alias,
      role: a.role,
      isActive: a.isActive,
      saleCount: a.saleCount,
      salesTotalKurus: a.salesTotalKurus,
      sharePermille: share(a.salesTotalKurus, totalStaffSales),
      avgBasketKurus: a.saleCount > 0 ? divRound(a.salesTotalKurus, a.saleCount) : null,
      itemsPerSaleTenths: a.saleCount > 0 ? mulDivRound(a.itemsSold, 10, a.saleCount) : null,
      grossProfitKurus: a.grossProfitKurus,
      marginPermille: marginPermille(a.grossProfitKurus, a.salesNetKurus - a.refundNetKurus),
      discountKurus: a.discountKurus,
      discountRatePermille: share(a.discountKurus, a.salesTotalKurus + a.discountKurus),
      voidCount: a.voidCount,
      voidRatePermille: share(a.voidCount, a.saleCount + a.voidCount),
      returnCount: a.returnCount,
      refundRatePermille: share(a.refundKurus, a.salesTotalKurus),
      activeDays: a.activeDays,
      salesPerHourKurus: a.activeMinutes >= 30 ? mulDivRound(a.salesTotalKurus, 60, a.activeMinutes) : null,
    };
  });
  const teamSales = staffAggs.reduce((a, s) => a + s.saleCount, 0);
  const teamVoids = staffAggs.reduce((a, s) => a + s.voidCount, 0);
  const teamDiscount = staffAggs.reduce((a, s) => a + s.discountKurus, 0);

  // ---------------------------------------------------------------- veri kalitesi
  const notes: string[] = [];
  if (historyDays < 28) notes.push(`Program ${historyDays} gündür kullanılıyor; karşılaştırmalar ve hedefler sınırlı veriye dayanıyor.`);
  if (isPartial) notes.push(`Ay henüz bitmedi: ${elapsedDays}/${daysInMonth} gün. Önceki ayla aynı gün sayısı karşılaştırılıyor.`);
  if (exp.byCategory.length === 0) notes.push("Bu ay gider girilmemiş; net kâr gerçekte daha düşük olabilir.");
  if (notClosed > 0) notes.push(`${notClosed} satış günü kapatılmamış (kasa sayımı yapılmamış).`);
  const zeroCost = [...econ.keys()].filter((id) => (info.get(id)?.avgCostKurus ?? 1) === 0).length;
  if (zeroCost > 0) notes.push(`${zeroCost} ürünün alış fiyatı 0 görünüyor; bu ürünlerin kârı olduğundan yüksek hesaplanıyor.`);

  const facts: MonthlyFacts = {
    version: 1,
    month,
    monthLabel: monthLabel(month),
    from,
    to,
    isPartial,
    daysInMonth,
    elapsedDays,
    generatedAt: ctx.now().toISOString(),
    businessName: getSettings(ctx.db).businessName,
    kpi,
    previous: { month: prevMonth, kpi: prevKpi },
    lastYear: lyKpi.saleCount > 0 ? { month: lyMonth, kpi: lyKpi } : null,
    changes: {
      revenue: changePermille(kpi.revenueGrossKurus, prevKpi.revenueGrossKurus),
      grossProfit: changePermille(kpi.grossProfitKurus, prevKpi.grossProfitKurus),
      netProfit: changePermille(kpi.netProfitKurus, prevKpi.netProfitKurus),
      saleCount: changePermille(kpi.saleCount, prevKpi.saleCount),
      avgBasket: kpi.avgBasketKurus !== null && prevKpi.avgBasketKurus !== null ? changePermille(kpi.avgBasketKurus, prevKpi.avgBasketKurus) : null,
      margin: kpi.marginPermille !== null && prevKpi.marginPermille !== null ? kpi.marginPermille - prevKpi.marginPermille : null,
    },
    trend,
    targets: extra.targets,
    products: {
      soldCount: lines.filter((l) => l.qty > 0).length,
      activeCount: [...info.values()].filter((p) => p.isActive).length,
      topProfit: byProfit.slice(0, 10),
      topRevenue: byRevenue.slice(0, 10),
      worst: byProfit.filter((l) => l.grossProfitKurus <= 0 || (l.marginPermille !== null && l.marginPermille < 100)).slice(-8).reverse(),
      risers,
      fallers,
      negativeMargin: negativeMargin.sort(byGain).slice(0, 8),
      erosion: erosion.sort(byGain).slice(0, 10),
      lowMarginStars: lowMarginStars.sort(byGain).slice(0, 6),
    },
    abc,
    categories,
    stock: {
      valueAtCostKurus: valueAtCost,
      daysOfInventory: dailyCogs > 0 ? divRound(valueAtCost, dailyCogs) : null,
      outOfStock: plan
        .filter((p) => p.status === "bitti" && p.soldLast30 > 0)
        .map((p) => ({ name: p.name, dailyAvgTenths: p.dailyAvgTenths, lostProfitPerWeekKurus: mulDivRound(p.soldLast30 * 7, unitProfitNet(p.id), 30) }))
        .sort((a, b) => b.lostProfitPerWeekKurus - a.lostProfitPerWeekKurus)
        .slice(0, 10),
      urgent: plan
        .filter((p) => p.status === "acil")
        .slice(0, 10)
        .map((p) => ({ name: p.name, stockQty: p.stockQty, daysCover: p.daysCover, suggestQty: p.suggestQty })),
      reorderCostKurus: plan.reduce((a, p) => a + p.suggestCostKurus, 0),
      dead: { count: dead.length, valueAtCostKurus: dead.reduce((a, d) => a + d.valueAtCostKurus, 0), items: dead.slice(0, 8) },
      purchases: getPurchaseStats(ctx.db, from, to),
    },
    expenses: {
      totalNetKurus: exp.netKurus,
      previousNetKurus: prevExp.netKurus,
      avg3NetKurus: avg3,
      ratioPermille: share(exp.netKurus, kpi.revenueNetKurus),
      byCategory: expByCategory,
    },
    time: {
      weekdays: wd.map((w, i) => ({
        day: WEEKDAYS[i]!,
        revenueGrossKurus: w.rev,
        saleCount: w.n,
        sharePermille: share(w.rev, wdTotal),
        avgPerDayKurus: dayCount[i]! > 0 ? divRound(w.rev, dayCount[i]!) : null,
      })),
      hours: activeHours.map((h) => ({ hour: h.hour, saleCount: h.n, revenueGrossKurus: h.rev, sharePermille: share(h.rev, hrTotal) })),
      peakHours: sortedHours.slice(0, 3).map((h) => h.hour),
      quietHours: quiet,
    },
    basket: { pairs, avgItemsTenths: kpi.itemsPerBasketTenths },
    returns: { ratePermille: share(kpi.refundsKurus, kpi.revenueGrossKurus + kpi.refundsKurus), topProducts: topReturns },
    cash: {
      ...closingStats,
      daysWithSalesNotClosed: notClosed,
      okcDiffPermille: closing.okcExpectedKurus > 0 ? changePermille(closing.okcZTotalKurus, closing.okcExpectedKurus) : null,
    },
    staff: {
      team: {
        saleCount: teamSales,
        voidCount: teamVoids,
        salesTotalKurus: totalStaffSales,
        discountKurus: teamDiscount,
        avgBasketKurus: teamSales > 0 ? divRound(totalStaffSales, teamSales) : null,
        voidRatePermille: share(teamVoids, teamSales + teamVoids),
        discountRatePermille: share(teamDiscount, totalStaffSales + teamDiscount),
      },
      members,
    },
    priceChanges: Object.values(countAuditActions(ctx.db, from, to, ["product.price", "product.bulk_price"])).reduce((a, n) => a + n, 0),
    priorActions: extra.priorActions,
    dataQuality: { historyDays, notes },
  };
  return { facts, aliasNames };
}
