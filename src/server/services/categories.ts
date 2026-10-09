import type { Ctx } from "../context";
import {
  deleteCategory,
  findCategoryByName,
  getCategoryById,
  insertCategory,
  listCategoriesWithCounts,
  renameCategory,
  type Category,
} from "../db/repositories/categories";
import { conflict, notFound } from "../errors";
import { parseInput, z } from "../validation/zod";
import { audit } from "./audit";
import { stamp } from "./clock";

const nameSchema = z.object({ name: z.string().trim().min(1, "Kategori adı zorunludur.").max(60) });

export function listCategoriesForAdmin(ctx: Ctx) {
  return listCategoriesWithCounts(ctx.db);
}

export function createCategory(ctx: Ctx, input: z.input<typeof nameSchema>): Category {
  const { name } = parseInput(nameSchema, input);
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction((): Category => {
      if (findCategoryByName(ctx.db, name)) throw conflict("CATEGORY_EXISTS", `"${name}" kategorisi zaten var.`);
      const id = insertCategory(ctx.db, name, nowIso);
      audit(ctx, "category", `Kategori eklendi: ${name}`, { entityType: "category", entityId: id });
      return { id, name };
    })
    .immediate();
}

export function updateCategory(ctx: Ctx, id: number, input: z.input<typeof nameSchema>): Category {
  const { name } = parseInput(nameSchema, input);
  return ctx.db
    .transaction((): Category => {
      const c = getCategoryById(ctx.db, id);
      if (!c) throw notFound("CATEGORY_NOT_FOUND", "Kategori bulunamadı.");
      const other = findCategoryByName(ctx.db, name);
      if (other && other.id !== id) throw conflict("CATEGORY_EXISTS", `"${name}" kategorisi zaten var.`);
      renameCategory(ctx.db, id, name);
      if (c.name !== name) audit(ctx, "category", `Kategori adı: ${c.name} → ${name}`, { entityType: "category", entityId: id });
      return { id, name };
    })
    .immediate();
}

/** Sadece içinde ürün olmayan kategori silinir (geçmiş raporlar bozulmasın). */
export function removeCategory(ctx: Ctx, id: number): void {
  ctx.db
    .transaction(() => {
      const c = listCategoriesWithCounts(ctx.db).find((x) => x.id === id);
      if (!c) throw notFound("CATEGORY_NOT_FOUND", "Kategori bulunamadı.");
      if (c.productCount > 0) {
        throw conflict("CATEGORY_NOT_EMPTY", `"${c.name}" kategorisinde ${c.productCount} ürün var. Önce ürünleri başka kategoriye taşıyın.`);
      }
      deleteCategory(ctx.db, id);
      audit(ctx, "category", `Kategori silindi: ${c.name}`, { entityType: "category", entityId: id });
    })
    .immediate();
}
