import { getBusinessDate } from "@/lib/businessDate";
import type { Ctx } from "../context";

/** İşlemin zaman damgası (UTC ISO) ve iş günü (İstanbul). */
export function stamp(ctx: Ctx): { nowIso: string; businessDate: string; now: Date } {
  const now = ctx.now();
  return { now, nowIso: now.toISOString(), businessDate: getBusinessDate(now) };
}
