import { listDaySales } from "@/server/db/repositories/reports";
import { apiRoute, readJson } from "@/server/http/api";
import { parseDateParam } from "@/server/services/dashboard";
import { completeSale } from "@/server/services/sales";
import { saleResultView } from "@/server/views";

/** Günün satış listesi (owner). */
export const GET = apiRoute(["owner"], ({ req, ctx }) => {
  const date = parseDateParam(ctx, new URL(req.url).searchParams.get("date"));
  return { date, items: listDaySales(ctx.db, date) };
});

export const POST = apiRoute(["owner", "cashier"], async ({ req, ctx, role }) => {
  const result = completeSale(ctx, (await readJson(req)) as never, { role: role! });
  return saleResultView(result, role!);
});
