import type { Ctx } from "../context";
import { listAllBarcodes, listBarcodesByProduct, type ProductBarcode } from "../db/repositories/barcodes";
import { getCategoryById, getOrCreateCategory } from "../db/repositories/categories";
import {
  getProductById,
  insertProduct,
  listProducts,
  updateProduct as updateProductRow,
  type Product,
} from "../db/repositories/products";
import { badRequest, notFound } from "../errors";
import { idSchema, kurusSchema, vatRateSchema } from "../validation/common";
import { parseInput, z } from "../validation/zod";
import { attachBarcode, nextInternalBarcode } from "./barcodes";
import { stamp } from "./clock";
import { applyStockChange } from "./stock";

const nameSchema = z.string().trim().min(1, "Ürün adı zorunludur.").max(120);
const categoryNameSchema = z.string().trim().min(1).max(60);

export const createProductSchema = z.object({
  name: nameSchema,
  categoryId: idSchema.nullish(),
  categoryName: categoryNameSchema.nullish(),
  salePriceKurus: kurusSchema,
  costPriceKurus: kurusSchema.default(0),
  vatRate: vatRateSchema.default(20),
  initialStock: z.int().min(0).max(1_000_000).default(0),
  minStock: z.int().min(0).max(1_000_000).default(0),
  barcodes: z
    .array(z.object({ barcode: z.string().max(80), type: z.enum(["internal", "manufacturer"]).optional() }))
    .max(10)
    .default([]),
  /** Barkod verilmediyse dükkân içi barkod üretilsin mi? */
  generateBarcodeIfMissing: z.boolean().default(true),
});
export type CreateProductInput = z.input<typeof createProductSchema>;

export interface ProductWithBarcodes extends Product {
  barcodes: ProductBarcode[];
}

function resolveCategoryId(
  ctx: Ctx,
  data: { categoryId?: number | null; categoryName?: string | null },
  nowIso: string,
): number | null {
  if (data.categoryId) {
    if (!getCategoryById(ctx.db, data.categoryId)) throw badRequest("CATEGORY_NOT_FOUND", "Kategori bulunamadı.");
    return data.categoryId;
  }
  if (data.categoryName) return getOrCreateCategory(ctx.db, data.categoryName, nowIso).id;
  return null;
}

/**
 * Yeni ürün: kategori (gerekirse oluşturulur), barkodlar (ilk verilen birincil olur; hiç yoksa
 * dükkân içi barkod üretilir) ve başlangıç stoğu ('initial' hareketi) tek transaction'da yazılır.
 */
export function createProduct(ctx: Ctx, input: CreateProductInput): ProductWithBarcodes {
  const data = parseInput(createProductSchema, input);
  const time = stamp(ctx);
  return ctx.db
    .transaction((): ProductWithBarcodes => {
      const categoryId = resolveCategoryId(ctx, data, time.nowIso);
      const id = insertProduct(
        ctx.db,
        {
          name: data.name,
          categoryId,
          salePriceKurus: data.salePriceKurus,
          avgCostKurus: data.costPriceKurus,
          vatRate: data.vatRate,
          minStock: data.minStock,
          unit: "adet",
        },
        time.nowIso,
      );
      data.barcodes.forEach((b, i) =>
        attachBarcode(ctx.db, id, b.barcode, { type: b.type, makePrimary: i === 0, nowIso: time.nowIso }),
      );
      if (data.barcodes.length === 0 && data.generateBarcodeIfMissing) {
        attachBarcode(ctx.db, id, nextInternalBarcode(ctx.db), {
          type: "internal",
          makePrimary: true,
          nowIso: time.nowIso,
        });
      }
      if (data.initialStock > 0) {
        applyStockChange(ctx.db, time, {
          productId: id,
          qtyChange: data.initialStock,
          type: "initial",
          unitCostKurus: data.costPriceKurus,
          refType: null,
          refId: null,
          note: "Başlangıç stoğu",
        });
      }
      return getProductWithBarcodes(ctx, id)!;
    })
    .immediate();
}

export const updateProductSchema = z.object({
  name: nameSchema.optional(),
  categoryId: idSchema.nullish(),
  categoryName: categoryNameSchema.nullish(),
  salePriceKurus: kurusSchema.optional(),
  vatRate: vatRateSchema.optional(),
  minStock: z.int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductInput = z.input<typeof updateProductSchema>;

/**
 * Ürün bilgilerini günceller. Stok ve ortalama maliyet buradan DEĞİŞMEZ
 * (onlar mal girişi / stok sayımı ile değişir). Eski satışların snapshot'ları etkilenmez.
 */
export function updateProduct(ctx: Ctx, id: number, input: UpdateProductInput): ProductWithBarcodes {
  const data = parseInput(updateProductSchema, input);
  const time = stamp(ctx);
  return ctx.db
    .transaction((): ProductWithBarcodes => {
      if (!getProductById(ctx.db, id)) throw notFound("PRODUCT_NOT_FOUND", "Ürün bulunamadı.");
      let categoryId: number | null | undefined;
      if (data.categoryName) categoryId = resolveCategoryId(ctx, { categoryName: data.categoryName }, time.nowIso);
      else if (data.categoryId !== undefined) categoryId = resolveCategoryId(ctx, data, time.nowIso);
      updateProductRow(
        ctx.db,
        id,
        {
          name: data.name,
          categoryId,
          salePriceKurus: data.salePriceKurus,
          vatRate: data.vatRate,
          minStock: data.minStock,
          isActive: data.isActive,
        },
        time.nowIso,
      );
      return getProductWithBarcodes(ctx, id)!;
    })
    .immediate();
}

export function getProductWithBarcodes(ctx: Ctx, id: number): ProductWithBarcodes | undefined {
  const p = getProductById(ctx.db, id);
  return p && { ...p, barcodes: listBarcodesByProduct(ctx.db, id) };
}

export function listProductsWithBarcodes(ctx: Ctx, opts: { activeOnly?: boolean } = {}): ProductWithBarcodes[] {
  const byProduct = new Map<number, ProductBarcode[]>();
  for (const b of listAllBarcodes(ctx.db)) {
    const list = byProduct.get(b.productId) ?? [];
    list.push(b);
    byProduct.set(b.productId, list);
  }
  return listProducts(ctx.db, opts).map((p) => ({ ...p, barcodes: byProduct.get(p.id) ?? [] }));
}

/** Kasa kataloğu: maliyet/kâr bilgisi İÇERMEZ (hem kasiyer hem owner için aynı). */
export interface CatalogItem {
  id: number;
  name: string;
  salePriceKurus: number;
  vatRate: number;
  stockQty: number;
  minStock: number;
  barcodes: string[];
  primaryBarcode: string | null;
}

export function toCatalogItem(p: ProductWithBarcodes): CatalogItem {
  return {
    id: p.id,
    name: p.name,
    salePriceKurus: p.salePriceKurus,
    vatRate: p.vatRate,
    stockQty: p.stockQty,
    minStock: p.minStock,
    barcodes: p.barcodes.map((b) => b.barcode),
    primaryBarcode: p.barcodes.find((b) => b.isPrimary)?.barcode ?? null,
  };
}

export function getCatalog(ctx: Ctx): CatalogItem[] {
  return listProductsWithBarcodes(ctx, { activeOnly: true }).map(toCatalogItem);
}
