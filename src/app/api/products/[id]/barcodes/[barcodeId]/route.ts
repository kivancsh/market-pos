import { apiRoute, parseId, readJson } from "@/server/http/api";
import { makeBarcodePrimary, removeBarcode } from "@/server/services/barcodes";
import { getProductWithBarcodes } from "@/server/services/products";
import { parseInput, z } from "@/server/validation/zod";

type P = { id: string; barcodeId: string };

export const DELETE = apiRoute<P>(["owner"], ({ ctx, params }) => {
  const id = parseId(params.id);
  removeBarcode(ctx, id, parseId(params.barcodeId));
  return { product: getProductWithBarcodes(ctx, id) };
});

/** Birincil barkodu değiştirir. */
export const PATCH = apiRoute<P>(["owner"], async ({ req, ctx, params }) => {
  parseInput(z.object({ isPrimary: z.literal(true) }), await readJson(req));
  const id = parseId(params.id);
  makeBarcodePrimary(ctx, id, parseId(params.barcodeId));
  return { product: getProductWithBarcodes(ctx, id) };
});
