import { getBusinessDate } from "@/lib/businessDate";
import type { Ctx } from "../context";
import { getDayClosing, isDayClosed, markReopened, upsertDayClosing, type DayClosingRow } from "../db/repositories/dayClosings";
import { getPeriodSummary, type PeriodSummary } from "../db/repositories/reports";
import { getSettings } from "../db/repositories/settings";
import { badRequest, conflict } from "../errors";
import { kurusSchema, optionalText } from "../validation/common";
import { parseInput, z } from "../validation/zod";
import { stamp } from "./clock";

export interface ClosingHistoryEntry {
  closedAt: string;
  reopenedAt: string | null;
  reopenReason: string | null;
  expectedCashKurus: number;
  countedCashKurus: number | null;
}

export interface ClosingSummaryJson {
  summary: PeriodSummary;
  openingCashKurus: number;
  /** Önceki kapanış/yeniden açılışlar (denetim izi). */
  history: ClosingHistoryEntry[];
}

export interface DayClosingView {
  businessDate: string;
  closed: boolean;
  closedAt: string | null;
  expectedCashKurus: number;
  openingCashKurus: number;
  countedCashKurus: number | null;
  cashDifferenceKurus: number | null;
  note: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  history: ClosingHistoryEntry[];
}

/** Beklenen kasa nakdi = açılış kasası + nakit satışlar − nakit iadeler. */
export function expectedCash(summary: PeriodSummary, openingCashKurus: number): number {
  return openingCashKurus + summary.cash.salesKurus - summary.cash.refundsKurus;
}

function view(businessDate: string, row: DayClosingRow | undefined, openingCashKurus: number, liveExpected: number): DayClosingView {
  if (!row) {
    return {
      businessDate,
      closed: false,
      closedAt: null,
      expectedCashKurus: liveExpected,
      openingCashKurus,
      countedCashKurus: null,
      cashDifferenceKurus: null,
      note: null,
      reopenedAt: null,
      reopenReason: null,
      history: [],
    };
  }
  const json = JSON.parse(row.summaryJson) as Partial<ClosingSummaryJson>;
  const closed = row.reopenedAt === null;
  return {
    businessDate,
    closed,
    closedAt: row.closedAt,
    // Kapalıysa dondurulmuş değer; yeniden açıldıysa güncel hesap
    expectedCashKurus: closed ? row.expectedCashKurus : liveExpected,
    openingCashKurus: json.openingCashKurus ?? openingCashKurus,
    countedCashKurus: row.countedCashKurus,
    cashDifferenceKurus: row.cashDifferenceKurus,
    note: row.note,
    reopenedAt: row.reopenedAt,
    reopenReason: row.reopenReason,
    history: json.history ?? [],
  };
}

export function getDayClosingView(ctx: Ctx, businessDate: string): DayClosingView {
  const opening = getSettings(ctx.db).openingCashKurus;
  const summary = getPeriodSummary(ctx.db, businessDate, businessDate);
  return view(businessDate, getDayClosing(ctx.db, businessDate), opening, expectedCash(summary, opening));
}

export const closeDaySchema = z.object({
  businessDate: z.iso.date().optional(),
  countedCashKurus: kurusSchema.nullish(),
  note: optionalText(500),
});

/**
 * Gün sonu kapanışı: günün özeti hesaplanıp dondurulur, beklenen/sayılan nakit ve fark kaydedilir.
 * Kapanıştan sonra o güne satış ve iade yapılamaz (yeniden açılana kadar).
 * Yedekleme transaction dışında, API katmanında yapılır.
 */
export function closeDay(ctx: Ctx, input: z.input<typeof closeDaySchema>): DayClosingView {
  const data = parseInput(closeDaySchema, input);
  const time = stamp(ctx);
  const date = data.businessDate ?? time.businessDate;
  if (date > time.businessDate) throw badRequest("FUTURE_DATE", "İleri bir tarihin günü kapatılamaz.");
  return ctx.db
    .transaction((): DayClosingView => {
      if (isDayClosed(ctx.db, date)) throw conflict("ALREADY_CLOSED", "Bu gün zaten kapatılmış.");
      const prev = getDayClosing(ctx.db, date);
      const opening = getSettings(ctx.db).openingCashKurus;
      const summary = getPeriodSummary(ctx.db, date, date);
      const expected = expectedCash(summary, opening);
      const counted = data.countedCashKurus ?? null;
      const prevJson = prev ? (JSON.parse(prev.summaryJson) as Partial<ClosingSummaryJson>) : null;
      const history: ClosingHistoryEntry[] = [
        ...(prevJson?.history ?? []),
        ...(prev
          ? [
              {
                closedAt: prev.closedAt,
                reopenedAt: prev.reopenedAt,
                reopenReason: prev.reopenReason,
                expectedCashKurus: prev.expectedCashKurus,
                countedCashKurus: prev.countedCashKurus,
              },
            ]
          : []),
      ];
      const json: ClosingSummaryJson = { summary, openingCashKurus: opening, history };
      upsertDayClosing(ctx.db, {
        businessDate: date,
        closedAt: time.nowIso,
        summaryJson: JSON.stringify(json),
        expectedCashKurus: expected,
        countedCashKurus: counted,
        cashDifferenceKurus: counted === null ? null : counted - expected,
        note: data.note,
      });
      return getDayClosingView(ctx, date);
    })
    .immediate();
}

export const reopenDaySchema = z.object({
  reason: z.string().trim().min(3, "Yeniden açma gerekçesi zorunludur (en az 3 karakter).").max(300),
});

export function reopenDay(ctx: Ctx, businessDate: string, input: z.input<typeof reopenDaySchema>): DayClosingView {
  const data = parseInput(reopenDaySchema, input);
  const time = stamp(ctx);
  return ctx.db
    .transaction((): DayClosingView => {
      if (!isDayClosed(ctx.db, businessDate)) throw conflict("NOT_CLOSED", "Bu gün kapalı değil.");
      markReopened(ctx.db, businessDate, time.nowIso, data.reason);
      return getDayClosingView(ctx, businessDate);
    })
    .immediate();
}

export function todayOf(ctx: Ctx): string {
  return getBusinessDate(ctx.now());
}
