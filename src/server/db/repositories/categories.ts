import type { DB } from "../types";

export interface Category {
  id: number;
  name: string;
}

export function listCategories(db: DB): Category[] {
  return db.prepare("SELECT id, name FROM categories ORDER BY name COLLATE NOCASE").all() as Category[];
}

export function getCategoryById(db: DB, id: number): Category | undefined {
  return db.prepare("SELECT id, name FROM categories WHERE id = ?").get(id) as Category | undefined;
}

/** Adı verilen kategoriyi bulur, yoksa oluşturur. */
export function getOrCreateCategory(db: DB, name: string, nowIso: string): Category {
  const existing = db.prepare("SELECT id, name FROM categories WHERE name = ?").get(name) as
    | Category
    | undefined;
  if (existing) return existing;
  const id = Number(
    db.prepare("INSERT INTO categories (name, created_at) VALUES (?, ?)").run(name, nowIso).lastInsertRowid,
  );
  return { id, name };
}

export interface CategoryWithCount extends Category {
  productCount: number;
  activeCount: number;
}

export function listCategoriesWithCounts(db: DB): CategoryWithCount[] {
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(p.id) AS productCount, COALESCE(SUM(p.is_active), 0) AS activeCount
         FROM categories c LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as CategoryWithCount[];
}

export function findCategoryByName(db: DB, name: string): Category | undefined {
  return db.prepare("SELECT id, name FROM categories WHERE name = ? COLLATE NOCASE").get(name) as Category | undefined;
}

export function insertCategory(db: DB, name: string, nowIso: string): number {
  return Number(db.prepare("INSERT INTO categories (name, created_at) VALUES (?, ?)").run(name, nowIso).lastInsertRowid);
}

export function renameCategory(db: DB, id: number, name: string): void {
  db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, id);
}

export function deleteCategory(db: DB, id: number): void {
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}
