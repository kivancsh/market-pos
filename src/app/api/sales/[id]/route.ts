import { listReturnsBySale } from "@/server/db/repositories/returns";
import { getSaleById, getSaleItems } from "@/server/db/repositories/sales";
import { notFound } from "@/server/errors";
import { apiRoute, parseId } from "@/server/http/api";

export const GET = apiRoute<{ id: string }>(["owner"], ({ ctx, params }) => {
  const sale = getSaleById(ctx.db, parseId(params.id));
  if (!sale) throw notFound("SALE_NOT_FOUND", "Satış bulunamadı.");
  return { sale, items: getSaleItems(ctx.db, sale.id), returns: listReturnsBySale(ctx.db, sale.id) };
});
