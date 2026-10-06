import { listMovementsByProduct } from "@/server/db/repositories/stockMovements";
import { apiRoute, parseId } from "@/server/http/api";

export const GET = apiRoute(["owner"], ({ req, ctx }) => {
  const productId = parseId(new URL(req.url).searchParams.get("productId") ?? undefined);
  return { items: listMovementsByProduct(ctx.db, productId, 500) };
});
