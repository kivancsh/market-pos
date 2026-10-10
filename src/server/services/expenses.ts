/**
 * Giderler ve kâr-zarar.
 * - Gider: tarih, kategori, açıklama, KDV dahil tutar ve KDV oranı (0/1/10/20). Net ve KDV payı tam sayı kuruşla ayrılır.
 * - Kâr-zarar: net satış (KDV hariç, iadeler düşülmüş) − satılan malın maliyeti = brüt kâr; brüt kâr − giderler (KDV hariç) = net kâr.
 * - KDV özeti (bilgi amaçlı, resmi beyan değildir): satıştan hesaplanan KDV − (mal alışı + gider) KDV'si.
 */
import { addDays, isBusinessDate, startOfMonth, endOfMonth } from "@/lib/businessDate";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "@/lib/expenses";
import { formatTRY, marginPermille } from "@/lib/money";
import { netOfVat } from "@/lib/pricing";
import type { Ctx } from "../context";
import { expenseTotals, getExpense, insertExpense, listExpenses, purchaseTotals, softDeleteExpense, updateExpenseRow, type Expense, type ExpenseRow } from "../db/repositories/expenses";
import { getPeriodSummary } from "../db/repositories/reports";
import { badRequest, notFound } from "../errors";
import { parseInput, z } from "../validation/zod";
import { optionalText } from "../validation/common";
import { audit } from "./audit";
import { stamp } from "./clock";

const categoryKeys = EXPENSE_CATEGORIES.map((c) => c.key) as [string, ...string[]];

export const expenseSchema = z.object({
  businessDate: z.string().refine(isBusinessDate, "Geçerli bir tarih seçin."),
  category: z.enum(categoryKeys, "Bir kategori seçin."),
  description: optionalText(200),
  amountKurus: z.int().min(1, "Tutar 0'dan büyük olmalı.").max(1_000_000_000),
  vatRate: z.union([z.literal(0), z.literal(1), z.literal(10), z.literal(20)]),
});

function toRow(data: z.infer<typeof expenseSchema>): ExpenseRow {
  const net = netOfVat(data.amountKurus, data.vatRate);
  return {
    businessDate: data.businessDate,
    category: data.category,
    description: data.description,
    amountKurus: data.amountKurus,
    vatRate: data.vatRate,
    netKurus: net,
    vatKurus: data.amountKurus - net,
  };
}

const describe = (e: { category: string; amountKurus: number; businessDate: string; description: string | null }) =>
  `${expenseCategoryLabel(e.category)} ${formatTRY(e.amountKurus)} (${e.businessDate})${e.description ? ` — ${e.description}` : ""}`;

export function createExpense(ctx: Ctx, input: unknown): Expense {
  const row = toRow(parseInput(expenseSchema, input));
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction((): Expense => {
      const id = insertExpense(ctx.db, row, nowIso, { id: ctx.actor?.userId ?? null, name: ctx.actor?.name ?? null });
      audit(ctx, "expense.create", `Gider eklendi: ${describe(row)}`, { entityType: "expense", entityId: id });
      return getExpense(ctx.db, id)!;
    })
    .immediate();
}

export function updateExpense(ctx: Ctx, id: number, input: unknown): Expense {
  const row = toRow(parseInput(expenseSchema, input));
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction((): Expense => {
      const before = getExpense(ctx.db, id);
      if (!before) throw notFound("EXPENSE_NOT_FOUND", "Gider bulunamadı.");
      updateExpenseRow(ctx.db, id, row, nowIso);
      audit(ctx, "expense.update", `Gider düzeltildi: ${describe(before)} → ${describe(row)}`, { entityType: "expense", entityId: id });
      return getExpense(ctx.db, id)!;
    })
    .immediate();
}

export function deleteExpense(ctx: Ctx, id: number): void {
  const { nowIso } = stamp(ctx);
  ctx.db
    .transaction(() => {
      const before = getExpense(ctx.db, id);
      if (!before) throw notFound("EXPENSE_NOT_FOUND", "Gider bulunamadı.");
      softDeleteExpense(ctx.db, id, nowIso);
      audit(ctx, "expense.delete", `Gider silindi: ${describe(before)}`, { entityType: "expense", entityId: id });
    })
    .immediate();
}

export function getExpenses(ctx: Ctx, from: string, to: string) {
  return { items: listExpenses(ctx.db, from, to), totals: expenseTotals(ctx.db, from, to) };
}

// ------------------------------------------------------------------ kâr-zarar

export function getProfitLoss(ctx: Ctx, from: string, to: string) {
  if (!isBusinessDate(from) || !isBusinessDate(to) || from > to) throw badRequest("BAD_RANGE", "Geçersiz tarih aralığı.");
  const s = getPeriodSummary(ctx.db, from, to);
  const exp = expenseTotals(ctx.db, from, to);
  const pur = purchaseTotals(ctx.db, from, to);
  const netProfitKurus = s.grossProfitKurus - exp.netKurus;
  return {
    from,
    to,
    salesGrossKurus: s.salesTotalKurus,
    refundsKurus: s.refundsKurus,
    revenueGrossKurus: s.revenueGrossKurus,
    revenueNetKurus: s.revenueNetKurus,
    costNetKurus: s.costNetKurus,
    grossProfitKurus: s.grossProfitKurus,
    grossMarginPermille: s.marginPermille,
    expenses: exp,
    netProfitKurus,
    netMarginPermille: marginPermille(netProfitKurus, s.revenueNetKurus),
    vat: {
      /** Satışlardan hesaplanan KDV (iadeler düşülmüş) */
      salesVatKurus: s.vatKurus,
      /** Mal alışlarının KDV'si (ürünün bugünkü KDV oranıyla, yaklaşık) */
      purchaseVatKurus: pur.vatKurus,
      purchasesGrossKurus: pur.amountKurus,
      expenseVatKurus: exp.vatKurus,
      /** Ödenecek (+) / devreden (−) KDV, yaklaşık */
      balanceKurus: s.vatKurus - pur.vatKurus - exp.vatKurus,
    },
  };
}
export type ProfitLoss = ReturnType<typeof getProfitLoss>;

/** Son 12 ayın (bu ay dahil) aylık kâr-zarar özeti. */
export function getMonthlyProfitLoss(ctx: Ctx, today: string) {
  const months: { month: string; from: string; to: string }[] = [];
  let m = startOfMonth(today);
  for (let i = 0; i < 12; i++) {
    const end = endOfMonth(m);
    months.unshift({ month: m.slice(0, 7), from: m, to: end > today ? today : end });
    m = startOfMonth(addDays(m, -1));
  }
  return months.map((x) => {
    const p = getProfitLoss(ctx, x.from, x.to);
    return {
      month: x.month,
      revenueGrossKurus: p.revenueGrossKurus,
      revenueNetKurus: p.revenueNetKurus,
      grossProfitKurus: p.grossProfitKurus,
      expensesNetKurus: p.expenses.netKurus,
      netProfitKurus: p.netProfitKurus,
      netMarginPermille: p.netMarginPermille,
    };
  });
}
