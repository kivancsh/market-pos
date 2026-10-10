import { apiRoute, readJson } from "@/server/http/api";
import { createExpense, getExpenses } from "@/server/services/expenses";
import { parseRange } from "@/server/services/reports";

/** Giderler (tarih aralığı) ve kategori toplamları. */
export const GET = apiRoute(["owner"], ({ req, ctx }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = parseRange(ctx, sp.get("from"), sp.get("to"));
  return { from, to, ...getExpenses(ctx, from, to) };
});

/** Gider ekle. */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => ({ expense: createExpense(ctx, await readJson(req)) }));
