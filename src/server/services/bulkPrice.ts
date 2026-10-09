import { applyBulkChange, type BulkChange } from "@/lib/bulkPrice";
import { formatTRY, marginPermille } from "@/lib/money";
import { unitEconomics } from "@/lib/pricing";
import type { Ctx } from "../context";
import { listProducts, updateProduct as updateProductRow, type Product } from "../db/repositories/products";
import { badRequest } from "../errors";
import { idSchema } from "../validation/common";
import { parseInput, z } from "../validation/zod";
import { audit } from "./audit";
import { stamp } from "./clock";

export const bulkPriceSchema = z.object({
  scope: z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }),
    z.object({ type: z.literal("category"), categoryId: idSchema.nullable() }),
    z.object({ type: z.literal("products"), productIds: z.array(idSchema).min(1, "En az bir ürün seçin.").max(5000) }),
  ]),
  change: z.object({
    mode: z.enum(["percent", "amount"]),
    direction: z.enum(["increase", "decrease"]),
    value: z.int().min(1, "Değer 0'dan büyük olmalı.").max(1_000_000_000),
    rounding: z.enum(["none", "r50", "r100", "end90"]),
  }),
});
export type BulkPriceInput = z.input<typeof bulkPriceSchema>;

export interface BulkPriceRow {
  productId: number;
  name: string;
  categoryName: string | null;
  oldPriceKurus: number;
  newPriceKurus: number | null;
  avgCostKurus: number;
  newMarginPermille: number | null;
  belowCost: boolean;
  error: string | null;
}

function scopeProducts(ctx: Ctx, scope: z.infer<typeof bulkPriceSchema>["scope"]): Product[] {
  const active = listProducts(ctx.db, { activeOnly: true });
  if (scope.type === "all") return active;
  if (scope.type === "category") return active.filter((p) => p.categoryId === scope.categoryId);
  const ids = new Set(scope.productIds);
  return active.filter((p) => ids.has(p.id));
}

function computeRows(products: Product[], change: BulkChange): BulkPriceRow[] {
  return products.map((p) => {
    const np = applyBulkChange(p.salePriceKurus, change);
    const u = np === null ? null : unitEconomics(np, p.avgCostKurus, p.vatRate);
    return {
      productId: p.id,
      name: p.name,
      categoryName: p.categoryName,
      oldPriceKurus: p.salePriceKurus,
      newPriceKurus: np,
      avgCostKurus: p.avgCostKurus,
      newMarginPermille: u ? marginPermille(u.profitKurus, u.netPriceKurus) : null,
      belowCost: np !== null && np < p.avgCostKurus,
      error: np === null ? "Fiyat 0 veya altına düşüyor" : null,
    };
  });
}

export function previewBulkPrice(ctx: Ctx, input: BulkPriceInput): { rows: BulkPriceRow[] } {
  const data = parseInput(bulkPriceSchema, input);
  return { rows: computeRows(scopeProducts(ctx, data.scope), data.change) };
}

/** Önizlemeyle aynı hesabı tek transaction'da uygular. Hatalı satır varsa hiçbiri değişmez. */
export function applyBulkPrice(ctx: Ctx, input: BulkPriceInput): { updated: number } {
  const data = parseInput(bulkPriceSchema, input);
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction(() => {
      const rows = computeRows(scopeProducts(ctx, data.scope), data.change);
      if (rows.length === 0) throw badRequest("NO_PRODUCTS", "Seçime uyan ürün yok.");
      const bad = rows.filter((r) => r.error);
      if (bad.length) throw badRequest("INVALID_PRICES", `${bad.length} üründe fiyat 0 veya altına düşüyor: ${bad.map((r) => r.name).join(", ")}`);
      const changed = rows.filter((r) => r.newPriceKurus !== r.oldPriceKurus);
      for (const r of changed) updateProductRow(ctx.db, r.productId, { salePriceKurus: r.newPriceKurus! }, nowIso);
      const c = data.change;
      const desc =
        (c.mode === "percent" ? `%${(c.value - (c.value % 100)) / 100}${c.value % 100 ? "," + String(c.value % 100).padStart(2, "0").replace(/0$/, "") : ""}` : formatTRY(c.value)) +
        (c.direction === "increase" ? " artış" : " indirim");
      audit(ctx, "product.bulk_price", `Toplu fiyat güncelleme: ${changed.length} ürün, ${desc}`, {
        details: changed.map((r) => ({ productId: r.productId, name: r.name, old: r.oldPriceKurus, new: r.newPriceKurus })),
      });
      return { updated: changed.length };
    })
    .immediate();
}
