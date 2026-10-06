/**
 * İş günü yardımcıları. İş günü Europe/Istanbul saatine göre "YYYY-MM-DD"dir.
 * Tarih karşılaştırmaları ve "bugün/dün/bu hafta" filtreleri SADECE bu fonksiyonlarla yapılır.
 */

export const BUSINESS_TIME_ZONE = "Europe/Istanbul";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Verilen anın İstanbul'daki iş günü: "YYYY-MM-DD". */
export function getBusinessDate(date: Date = new Date()): string {
  const parts = dateFmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Verilen anın İstanbul saatindeki saati (0–23). */
export function getIstanbulHour(date: Date): number {
  const parts = hourFmt.formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")!.value);
}

/** "HH:MM" biçiminde İstanbul saati. */
export function formatIstanbulTime(date: Date): string {
  return hourFmt.format(date);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isBusinessDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

function toUtcDate(s: string): Date {
  if (!isBusinessDate(s)) throw new RangeError(`Geçersiz tarih: ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

/** İş gününe gün ekler/çıkarır (takvim aritmetiği; saat dilimi etkilemez). */
export function addDays(businessDate: string, days: number): string {
  const d = toUtcDate(businessDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Haftanın Pazartesi günü. */
export function startOfWeek(businessDate: string): string {
  const dow = toUtcDate(businessDate).getUTCDay(); // 0=Pazar
  return addDays(businessDate, dow === 0 ? -6 : 1 - dow);
}

export function startOfMonth(businessDate: string): string {
  return businessDate.slice(0, 8) + "01";
}

export function endOfMonth(businessDate: string): string {
  const d = toUtcDate(startOfMonth(businessDate));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "YYYYMMDD" (fiş numarası öneki). */
export function compactDate(businessDate: string): string {
  return businessDate.replaceAll("-", "");
}

export type RangePreset = "today" | "yesterday" | "this_week" | "this_month" | "last_month";

/** Hazır tarih aralıkları (her iki uç dahil). */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "this_week":
      return { from: startOfWeek(today), to: today };
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const lastDayPrev = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastDayPrev), to: lastDayPrev };
    }
  }
}
