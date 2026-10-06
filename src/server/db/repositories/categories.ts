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
