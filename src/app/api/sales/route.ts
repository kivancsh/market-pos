import { apiRoute, readJson } from "@/server/http/api";
import { completeSale } from "@/server/services/sales";
import { saleResultView } from "@/server/views";

export const POST = apiRoute(["owner", "cashier"], async ({ req, ctx, role }) => {
  const result = completeSale(ctx, (await readJson(req)) as never, { role: role! });
  return saleResultView(result, role!);
});
