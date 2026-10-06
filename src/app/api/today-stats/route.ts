import { getBusinessDate } from "@/lib/businessDate";
import { getDayQuickStats } from "@/server/db/repositories/stats";
import { apiRoute } from "@/server/http/api";

/** Kasa köşesi: bugünkü satış adedi; ciro sadece owner'a. */
export const GET = apiRoute(["owner", "cashier"], ({ ctx, role }) => {
  const date = getBusinessDate(ctx.now());
  const s = getDayQuickStats(ctx.db, date);
  return role === "owner" ? { date, ...s } : { date, saleCount: s.saleCount };
});
