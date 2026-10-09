import { getBusinessDate } from "@/lib/businessDate";
import { isDayClosed } from "@/server/db/repositories/dayClosings";
import { getDayQuickStats } from "@/server/db/repositories/stats";
import { apiRoute } from "@/server/http/api";

/** Kasa köşesi: bugünkü satış adedi ve gün kapalı mı; ciro sadece owner'a. */
export const GET = apiRoute(["owner", "cashier"], ({ ctx, role }) => {
  const date = getBusinessDate(ctx.now());
  const s = getDayQuickStats(ctx.db, date);
  const dayClosed = isDayClosed(ctx.db, date);
  return role === "owner" ? { date, ...s, dayClosed } : { date, saleCount: s.saleCount, dayClosed };
});
