import { apiRoute } from "@/server/http/api";
import { resolveBarcode } from "@/server/services/barcodes";
import { getProductWithBarcodes, toCatalogItem } from "@/server/services/products";

/** Okutulan değeri normalize edip eşleştirir. Ürün bilgisi katalog biçimindedir (maliyet yok). */
export const GET = apiRoute<{ code: string }>(["owner", "cashier"], ({ ctx, params }) => {
  const r = resolveBarcode(ctx, decodeURIComponent(params.code));
  if (r.status === "found" || r.status === "inactive") {
    return {
      status: r.status,
      barcode: r.barcode,
      product: toCatalogItem(getProductWithBarcodes(ctx, r.product.id)!),
    };
  }
  return r;
});
