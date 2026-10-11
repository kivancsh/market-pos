/**
 * Aylık hedefler: gerçekçi otomatik öneri + gidişat takibi.
 *
 * Taban (baseline): son 28 günün hafta günü ortalamaları × hedef ayındaki hafta günü sayıları (ör. 5 Cumartesili ay daha yüksek).
 * Büyüme: son 4 haftanın önceki 4 haftaya göre eğilimine göre %2–%8 arası (düşüşte önce düşüşü durdurmak hedeflenir).
 * Marj: fiyat aşınması düzeltilirse kazanılacak marj kadar (en çok +1 puan). Gider bütçesi: son 3 ayın ortalaması.
 * Gidişat: hedefin bugüne kadarki payı, hafta günü ağırlıklarıyla (Pazar az satıyorsa Pazar günü az beklenir).
 */
import { METRIC_INFO, TARGET_METRICS, isTargetMetric, shiftMonth, targetProgress, type TargetMetric, type TargetProgress } from "@/lib/assistant";
import { addDays, endOfMonth, isBusinessDate } from "@/lib/businessDate";
import { divRound, formatPermille, formatTRY, mulDivRound } from "@/lib/money";
import type { Ctx } from "../../context";
import { listTargets, setOwnerTarget, upsertAutoTarget, type TargetRow } from "../../db/repositories/assistant";
import { getFirstSaleDate } from "../../db/repositories/assistantData";
import { expenseTotals } from "../../db/repositories/expenses";
import { getDailyRows, getPeriodSummary } from "../../db/repositories/reports";
import { AppError, badRequest } from "../../errors";
import { parseInput, z } from "../../validation/zod";
import { weekdayIndex } from "../analytics";
import { audit } from "../audit";
import { todayOf } from "../dayClosing";

const WINDOW_DAYS = 28;

function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface WeekdayProfile {
  /** Hafta günü başına günlük ortalama (Pzt=0) */
  revenue: number[];
  revenueNet: number[];
  profit: number[];
  count: number[];
  /** Penceredeki gün sayısı (veri azsa küçük) */
  days: number;
}

/** `end` dahil son 28 günün (ilk satıştan önceki günler hariç) hafta günü ortalamaları. */
export function weekdayProfile(ctx: Ctx, end: string): WeekdayProfile {
  const first = getFirstSaleDate(ctx.db);
  let start = addDays(end, -(WINDOW_DAYS - 1));
  if (first && first > start) start = first;
  const empty = { revenue: [0, 0, 0, 0, 0, 0, 0], revenueNet: [0, 0, 0, 0, 0, 0, 0], profit: [0, 0, 0, 0, 0, 0, 0], count: [0, 0, 0, 0, 0, 0, 0], days: 0 };
  if (!first || start > end) return empty;
  const rows = getDailyRows(ctx.db, daysOf(start, end));
  const sums = { revenue: [0, 0, 0, 0, 0, 0, 0], revenueNet: [0, 0, 0, 0, 0, 0, 0], profit: [0, 0, 0, 0, 0, 0, 0], count: [0, 0, 0, 0, 0, 0, 0] };
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    const w = weekdayIndex(r.businessDate);
    n[w]! += 1;
    sums.revenue[w]! += r.revenueGrossKurus;
    sums.revenueNet[w]! += r.revenueNetKurus;
    sums.profit[w]! += r.grossProfitKurus;
    sums.count[w]! += r.saleCount;
  }
  // Pencerede hiç görülmeyen hafta günü (çok yeni dükkân): bütün günlerin ortalaması
  const avgAll = (arr: number[]) => (rows.length ? divRound(arr.reduce((a, v) => a + v, 0), rows.length) : 0);
  const per = (arr: number[]) => arr.map((v, i) => (n[i]! > 0 ? divRound(v, n[i]!) : avgAll(arr)));
  return { revenue: per(sums.revenue), revenueNet: per(sums.revenueNet), profit: per(sums.profit), count: per(sums.count), days: rows.length };
}

/** Ayın bugüne kadarki beklenen satış payı (binde), hafta günü ağırlıklı. */
export function elapsedSharePermille(profile: WeekdayProfile, month: string, to: string): number {
  const from = `${month}-01`;
  const all = daysOf(from, endOfMonth(from));
  const weight = (d: string) => profile.revenue[weekdayIndex(d)]!;
  const total = all.reduce((a, d) => a + weight(d), 0);
  const done = all.filter((d) => d <= to);
  if (total <= 0) return mulDivRound(done.length, 1000, all.length);
  return mulDivRound(done.reduce((a, d) => a + weight(d), 0), 1000, total);
}

export interface TargetProposal {
  metric: TargetMetric;
  baseline: number;
  target: number;
  rationale: string;
}

/**
 * `month` ayı için gerçekçi hedef önerisi. `asOf`: verinin son günü (genelde bir önceki ayın son günü ya da bugün).
 * `marginBoostPermille`: fiyat aksiyonlarıyla ulaşılabilecek ek marj (0–10).
 */
export function proposeTargets(ctx: Ctx, month: string, asOf: string, marginBoostPermille = 0): TargetProposal[] {
  const p = weekdayProfile(ctx, asOf);
  if (p.days === 0) return [];
  const from = `${month}-01`;
  const days = daysOf(from, endOfMonth(from));
  const proj = (arr: number[]) => days.reduce((a, d) => a + arr[weekdayIndex(d)]!, 0);
  const baseRev = proj(p.revenue);
  const baseNet = proj(p.revenueNet);
  const baseProfit = proj(p.profit);
  const baseCount = proj(p.count);

  // Eğilim: son 28 gün / önceki 28 gün
  const recent = getPeriodSummary(ctx.db, addDays(asOf, -27), asOf).revenueGrossKurus;
  const older = getPeriodSummary(ctx.db, addDays(asOf, -55), addDays(asOf, -28)).revenueGrossKurus;
  const trend = older > 0 && p.days >= WINDOW_DAYS ? mulDivRound(recent - older, 1000, older) : null;
  // Büyüme (binde): eğilim yoksa %3; büyüyorsa eğilimin üçte biri kadar ek, en çok %8; düşüşteyse %2 (önce toparlanma)
  const growth = trend === null ? 30 : trend < -50 ? 20 : Math.min(80, Math.max(30, 30 + divRound(Math.max(0, trend), 3)));
  const thin = p.days < 14;

  const baseMargin = baseNet > 0 ? mulDivRound(baseProfit, 1000, baseNet) : null;
  const marginTarget = baseMargin === null ? null : baseMargin + Math.max(0, Math.min(10, marginBoostPermille));
  const revTarget = mulDivRound(baseRev, 1000 + growth, 1000);
  const netTarget = mulDivRound(baseNet, 1000 + growth, 1000);
  const profitTarget = marginTarget === null ? mulDivRound(baseProfit, 1000 + growth, 1000) : mulDivRound(netTarget, marginTarget, 1000);
  const countTarget = mulDivRound(baseCount, 1000 + divRound(growth, 2), 1000);
  const basketTarget = countTarget > 0 ? divRound(revTarget, countTarget) : 0;
  const baseBasket = baseCount > 0 ? divRound(baseRev, baseCount) : 0;

  const prevMonths = [1, 2, 3].map((i) => {
    const f = `${shiftMonth(month, -i)}-01`;
    return expenseTotals(ctx.db, f, endOfMonth(f)).netKurus;
  });
  const withData = prevMonths.filter((v) => v > 0);
  const expBudget = withData.length ? divRound(withData.reduce((a, v) => a + v, 0), withData.length) : 0;

  const g = formatPermille(growth);
  const why = thin
    ? `Veri az (${p.days} gün); temkinli ${g} büyüme.`
    : trend === null
      ? `Son ${p.days} günün hafta günü ortalamalarıyla bu ayın gün dağılımı; ${g} büyüme.`
      : `Son 4 haftanın eğilimi ${formatPermille(trend)}; hafta günü dağılımına göre ${g} büyüme${trend < -50 ? " (önce düşüşü durdurmak)" : ""}.`;
  const out: TargetProposal[] = [
    { metric: "revenue", baseline: baseRev, target: revTarget, rationale: why },
    {
      metric: "gross_profit",
      baseline: baseProfit,
      target: profitTarget,
      rationale: marginTarget !== null && marginTarget > (baseMargin ?? 0) ? `${why} Fiyat düzeltmeleriyle marj +${formatPermille(marginTarget - baseMargin!).slice(1)} puan.` : why,
    },
    { metric: "sale_count", baseline: baseCount, target: countTarget, rationale: `Müşteri (fiş) sayısında büyümenin yarısı kadar artış: ${formatPermille(divRound(growth, 2))}.` },
    { metric: "avg_basket", baseline: baseBasket, target: basketTarget, rationale: "Büyümenin kalanı sepet büyüklüğünden (yan ürün önerisi, raf yerleşimi)." },
  ];
  if (marginTarget !== null) out.push({ metric: "margin", baseline: baseMargin!, target: marginTarget, rationale: marginTarget > baseMargin! ? "Maliyeti artan ürünlerin fiyatı güncellenirse." : "Marjı korumak." });
  if (expBudget > 0) {
    out.push({ metric: "expenses", baseline: expBudget, target: expBudget, rationale: `Son ${withData.length} ayın ortalaması (${formatTRY(expBudget)}); bunun üstüne çıkmamak.` });
    out.push({ metric: "net_profit", baseline: baseProfit - expBudget, target: profitTarget - expBudget, rationale: "Brüt kâr hedefi − gider bütçesi." });
  }
  return out;
}

/** Ay için otomatik hedefleri yazar (yöneticinin değiştirdiklerine dokunmaz). */
export function saveAutoTargets(ctx: Ctx, month: string, proposals: TargetProposal[]): void {
  const nowIso = ctx.now().toISOString();
  for (const t of proposals) upsertAutoTarget(ctx.db, { month, metric: t.metric, target: t.target, baseline: t.baseline, rationale: t.rationale }, nowIso);
}

/** Ayın hedefleri; hiç yoksa ve ay bu aysa veriye göre otomatik oluşturur. */
export function ensureTargets(ctx: Ctx, month: string, marginBoostPermille = 0): TargetRow[] {
  const existing = listTargets(ctx.db, month);
  if (existing.length > 0) return existing;
  const today = todayOf(ctx);
  if (month !== today.slice(0, 7)) return existing;
  // Ayın başında belirlenmiş gibi: geçen ayın son gününe kadarki veriyle; o güne en az bir haftalık veri yoksa bugüne kadar
  const asOfPrev = addDays(`${month}-01`, -1);
  const asOf = weekdayProfile(ctx, asOfPrev).days >= 7 ? asOfPrev : today;
  const proposals = proposeTargets(ctx, month, asOf, marginBoostPermille);
  if (proposals.length === 0) return existing;
  ctx.db.transaction(() => saveAutoTargets(ctx, month, proposals)).immediate();
  return listTargets(ctx.db, month);
}

function actualOf(ctx: Ctx, metric: TargetMetric, from: string, to: string): number {
  const s = getPeriodSummary(ctx.db, from, to);
  switch (metric) {
    case "revenue":
      return s.revenueGrossKurus;
    case "gross_profit":
      return s.grossProfitKurus;
    case "net_profit":
      return s.grossProfitKurus - expenseTotals(ctx.db, from, to).netKurus;
    case "margin":
      return s.marginPermille ?? 0;
    case "avg_basket":
      return s.avgBasketKurus ?? 0;
    case "sale_count":
      return s.saleCount;
    case "expenses":
      return expenseTotals(ctx.db, from, to).netKurus;
  }
}

/** Ayın hedef gerçekleşmesi (ay bitmişse tam ay, bitmemişse bugüne kadar + ay sonu tahmini). */
export function getTargetProgress(ctx: Ctx, month: string, rows: TargetRow[] = listTargets(ctx.db, month)): TargetProgress[] {
  if (rows.length === 0) return [];
  const today = todayOf(ctx);
  const from = `${month}-01`;
  const end = endOfMonth(from);
  const to = end < today ? end : today;
  if (from > today) return rows.map((r) => targetProgress(r.metric, r.target, r.baseline, 0, 0, false));
  let share = 1000;
  if (end > to) {
    // Ay sürüyor: hafta günü ağırlıkları ay başından önceki 4 haftadan (yeni dükkânda bu aydan)
    const before = weekdayProfile(ctx, addDays(from, -1));
    share = elapsedSharePermille(before.days >= 7 ? before : weekdayProfile(ctx, to), month, to);
  }
  const hasData = getPeriodSummary(ctx.db, from, to).saleCount > 0;
  const progress = rows.map((r) => targetProgress(r.metric, r.target, r.baseline, actualOf(ctx, r.metric, from, to), share, hasData));
  // Net kâr tahmini: brüt kâr tahmini − gider bütçesinin (ya da gerçekleşenin) büyüğü
  const gp = progress.find((p) => p.metric === "gross_profit");
  const ex = progress.find((p) => p.metric === "expenses");
  const np = progress.find((p) => p.metric === "net_profit");
  if (np && gp?.forecast != null && share < 1000) {
    const expForecast = Math.max(ex?.actual ?? 0, ex?.target ?? 0);
    np.forecast = gp.forecast - expForecast;
    np.status = np.forecast >= np.target ? (np.forecast * 1000 >= np.target * 1030 ? "ahead" : "on_track") : np.forecast * 1000 >= np.target * 970 ? "on_track" : "behind";
  }
  return progress;
}

// ------------------------------------------------------------------ yönetici hedef değiştirir

export const targetsInputSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  targets: z
    .array(z.object({ metric: z.string().refine(isTargetMetric, "Geçersiz hedef türü."), target: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000) }))
    .min(1)
    .max(TARGET_METRICS.length),
});

export function setTargets(ctx: Ctx, input: unknown): TargetRow[] {
  const data = parseInput(targetsInputSchema, input);
  const today = todayOf(ctx);
  if (data.month < today.slice(0, 7)) throw badRequest("PAST_MONTH", "Geçmiş ayın hedefi değiştirilemez.");
  for (const t of data.targets) {
    if (t.metric === "margin" && t.target > 1000) throw badRequest("BAD_TARGET", "Marj hedefi %100'ü geçemez.");
    if (t.target < 0 && t.metric !== "net_profit") throw badRequest("BAD_TARGET", `${METRIC_INFO[t.metric as TargetMetric].label} hedefi eksi olamaz.`);
  }
  const nowIso = ctx.now().toISOString();
  const existing = new Map(listTargets(ctx.db, data.month).map((r) => [r.metric, r]));
  ctx.db
    .transaction(() => {
      for (const t of data.targets) {
        const m = t.metric as TargetMetric;
        setOwnerTarget(ctx.db, data.month, m, t.target, existing.get(m)?.baseline ?? 0, nowIso);
      }
      audit(ctx, "assistant.targets", `${data.month} hedefleri: ${data.targets.map((t) => METRIC_INFO[t.metric as TargetMetric].label).join(", ")}`, {
        details: data.targets,
      });
    })
    .immediate();
  return listTargets(ctx.db, data.month);
}

export function assertMonth(month: string | null): string {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isBusinessDate(`${month}-01`)) throw new AppError("BAD_MONTH", "Geçersiz ay.", 400);
  return month;
}
