import { INTERNAL_SEQ_MAX, makeInternalEan13, normalizeBarcode, validateBarcodeForStorage } from "@/lib/barcode";
import type { Ctx } from "../context";
import type { DB } from "../db/types";
import {
  deleteBarcode,
  findBarcode,
  getBarcodeById,
  hasPrimaryBarcode,
  insertBarcode,
  listBarcodesByProduct,
  listProductIdsWithoutBarcode,
  setPrimaryBarcode,
  type BarcodeType,
  type ProductBarcode,
} from "../db/repositories/barcodes";
import { getProductById, type Product } from "../db/repositories/products";
import { incrementInternalBarcodeSeq } from "../db/repositories/settings";
import { conflict, notFound, unprocessable } from "../errors";
import { audit } from "./audit";
import { stamp } from "./clock";

/**
 * Bir sonraki boş dükkân içi barkodu üretir (sayaç ilerler). Üretilen barkod zaten
 * kullanılıyorsa sonrakine geçer. Transaction içinde çağrılmalı.
 */
export function nextInternalBarcode(db: DB): string {
  for (;;) {
    const seq = incrementInternalBarcodeSeq(db);
    if (seq > INTERNAL_SEQ_MAX) throw conflict("BARCODE_SEQ_EXHAUSTED", "Dükkân içi barkod numaraları tükendi.");
    const code = makeInternalEan13(seq);
    if (!findBarcode(db, code)) return code;
  }
}

/** Ekrandaki "Dükkân içi barkod üret" butonu için: boş bir barkod ayırır ve döndürür. */
export function generateInternalBarcode(ctx: Ctx): string {
  return ctx.db.transaction(() => nextInternalBarcode(ctx.db)).immediate();
}

export type ResolveResult =
  | { status: "found"; product: Product; barcode: string }
  | { status: "inactive"; product: Product; barcode: string }
  | { status: "not_found"; code: string }
  | { status: "invalid"; reason: "empty" | "invalid_check_digit"; code: string };

/** Okutulan ham değeri normalize edip ürünle eşleştirir. */
export function resolveBarcode(ctx: Ctx, raw: string): ResolveResult {
  const n = normalizeBarcode(raw);
  if (!n.ok) return { status: "invalid", reason: n.reason, code: n.reason === "empty" ? "" : n.code };
  for (const candidate of n.candidates) {
    const b = findBarcode(ctx.db, candidate);
    if (!b) continue;
    const product = getProductById(ctx.db, b.productId)!;
    return { status: product.isActive ? "found" : "inactive", product, barcode: candidate };
  }
  return { status: "not_found", code: n.code };
}

export type AvailabilityResult =
  | { available: true; code: string }
  | { available: false; code: string; message: string; productId?: number; productName?: string };

/** Ürün formundaki canlı benzersizlik kontrolü. */
export function checkBarcodeAvailability(ctx: Ctx, raw: string, exceptProductId?: number): AvailabilityResult {
  const v = validateBarcodeForStorage(raw);
  if (!v.ok) return { available: false, code: raw, message: v.message };
  const existing = findBarcode(ctx.db, v.code);
  if (existing && existing.productId !== exceptProductId) {
    const p = getProductById(ctx.db, existing.productId)!;
    return {
      available: false,
      code: v.code,
      message: `Bu barkod zaten "${p.name}" ürününe ait.`,
      productId: p.id,
      productName: p.name,
    };
  }
  if (existing) return { available: false, code: v.code, message: "Bu barkod zaten bu ürüne ekli." };
  return { available: true, code: v.code };
}

/**
 * Barkodu ürüne ekler (transaction içinde çağrılmalı). Biçim ve benzersizlik kontrol edilir.
 * Ürünün birincil barkodu yoksa veya `makePrimary` ise birincil yapılır.
 */
export function attachBarcode(
  db: DB,
  productId: number,
  raw: string,
  opts: { type?: BarcodeType; makePrimary?: boolean; nowIso: string },
): ProductBarcode {
  const v = validateBarcodeForStorage(raw);
  if (!v.ok) throw unprocessable("BARCODE_INVALID", v.message, { barcode: raw });
  const existing = findBarcode(db, v.code);
  if (existing) {
    const owner = getProductById(db, existing.productId)!;
    throw conflict("BARCODE_TAKEN", `Bu barkod zaten "${owner.name}" ürününe ait.`, {
      barcode: v.code,
      productId: owner.id,
    });
  }
  const makePrimary = opts.makePrimary || !hasPrimaryBarcode(db, productId);
  const id = insertBarcode(
    db,
    { productId, barcode: v.code, type: opts.type ?? "manufacturer", isPrimary: false },
    opts.nowIso,
  );
  if (makePrimary) setPrimaryBarcode(db, productId, id);
  return getBarcodeById(db, id)!;
}

export function addBarcodeToProduct(
  ctx: Ctx,
  productId: number,
  raw: string,
  opts: { type?: BarcodeType; makePrimary?: boolean } = {},
): ProductBarcode {
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction(() => {
      const p = getProductById(ctx.db, productId);
      if (!p) throw notFound("PRODUCT_NOT_FOUND", "Ürün bulunamadı.");
      const b = attachBarcode(ctx.db, productId, raw, { ...opts, nowIso });
      audit(ctx, "product.barcode", `${p.name}: barkod eklendi ${b.barcode}`, { entityType: "product", entityId: productId });
      return b;
    })
    .immediate();
}

/** Ürüne yeni dükkân içi barkod üretip ekler. */
export function assignInternalBarcode(ctx: Ctx, productId: number, makePrimary = false): ProductBarcode {
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction(() => {
      const p = getProductById(ctx.db, productId);
      if (!p) throw notFound("PRODUCT_NOT_FOUND", "Ürün bulunamadı.");
      const code = nextInternalBarcode(ctx.db);
      const b = attachBarcode(ctx.db, productId, code, { type: "internal", makePrimary, nowIso });
      audit(ctx, "product.barcode", `${p.name}: dükkân içi barkod üretildi ${code}`, { entityType: "product", entityId: productId });
      return b;
    })
    .immediate();
}

/** Barkodu üründen kaldırır. Birincil kaldırılırsa kalan en eski barkod birincil olur. */
export function removeBarcode(ctx: Ctx, productId: number, barcodeId: number): void {
  ctx.db
    .transaction(() => {
      const b = getBarcodeById(ctx.db, barcodeId);
      if (!b || b.productId !== productId) throw notFound("BARCODE_NOT_FOUND", "Barkod bulunamadı.");
      deleteBarcode(ctx.db, barcodeId);
      audit(ctx, "product.barcode", `${getProductById(ctx.db, productId)?.name}: barkod kaldırıldı ${b.barcode}`, {
        entityType: "product",
        entityId: productId,
      });
      if (b.isPrimary) {
        const next = listBarcodesByProduct(ctx.db, productId)[0];
        if (next) setPrimaryBarcode(ctx.db, productId, next.id);
      }
    })
    .immediate();
}

export function makeBarcodePrimary(ctx: Ctx, productId: number, barcodeId: number): void {
  ctx.db
    .transaction(() => {
      const b = getBarcodeById(ctx.db, barcodeId);
      if (!b || b.productId !== productId) throw notFound("BARCODE_NOT_FOUND", "Barkod bulunamadı.");
      setPrimaryBarcode(ctx.db, productId, barcodeId);
      audit(ctx, "product.barcode", `${getProductById(ctx.db, productId)?.name}: birincil barkod ${b.barcode}`, {
        entityType: "product",
        entityId: productId,
      });
    })
    .immediate();
}

/** Hiç barkodu olmayan tüm ürünlere dükkân içi birincil barkod üretir. */
export function generateMissingBarcodes(ctx: Ctx): { productId: number; barcode: string }[] {
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction(() => {
      const out = listProductIdsWithoutBarcode(ctx.db).map((productId) => {
        const code = nextInternalBarcode(ctx.db);
        attachBarcode(ctx.db, productId, code, { type: "internal", makePrimary: true, nowIso });
        return { productId, barcode: code };
      });
      if (out.length) audit(ctx, "product.barcode", `Barkodsuz ${out.length} ürüne dükkân içi barkod üretildi`);
      return out;
    })
    .immediate();
}
