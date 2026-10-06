import { apiRoute, parseId, readJson } from "@/server/http/api";
import { addBarcodeToProduct, assignInternalBarcode } from "@/server/services/barcodes";
import { getProductWithBarcodes } from "@/server/services/products";
import { parseInput, z } from "@/server/validation/zod";

const schema = z.union([
  z.object({ generate: z.literal(true), makePrimary: z.boolean().optional() }),
  z.object({ barcode: z.string().max(80), makePrimary: z.boolean().optional() }),
]);

/** Ürüne barkod ekler: verilen barkod (üretici) veya yeni dükkân içi barkod. */
export const POST = apiRoute<{ id: string }>(["owner"], async ({ req, ctx, params }) => {
  const id = parseId(params.id);
  const data = parseInput(schema, await readJson(req));
  if ("generate" in data) assignInternalBarcode(ctx, id, data.makePrimary ?? false);
  else addBarcodeToProduct(ctx, id, data.barcode, { type: "manufacturer", makePrimary: data.makePrimary });
  return { product: getProductWithBarcodes(ctx, id) };
});
