import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";

export const MIGRATIONS_DIR = path.join(process.cwd(), "src", "server", "db", "migrations");

/**
 * migrations klasöründeki NNN_*.sql dosyalarını ad sırasıyla uygular.
 * Her dosya kendi transaction'ında çalışır; uygulananlar schema_migrations'a yazılır.
 * Dönen değer: bu çağrıda yeni uygulanan dosyaların adları.
 */
export function runMigrations(db: DB, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((r) => (r as { name: string }).name),
  );

  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  const newlyApplied: string[] = [];
  const record = db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    }).immediate();
    newlyApplied.push(file);
  }
  return newlyApplied;
}
