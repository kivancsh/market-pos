import { apiRoute } from "@/server/http/api";
import { checkBarcodeAvailability } from "@/server/services/barcodes";

/** Canlı benzersizlik kontrolü: ?code=...&productId=... (productId: düzenlenen ürün). */
export const GET = apiRoute(["owner"], ({ req, ctx }) => {
  const url = new URL(req.url);
  const pid = Number(url.searchParams.get("productId"));
  return checkBarcodeAvailability(ctx, url.searchParams.get("code") ?? "", Number.isInteger(pid) && pid > 0 ? pid : undefined);
});
