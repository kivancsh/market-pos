import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate";
import type { DB } from "./types";

export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "store.db");

function applyPragmas(db: DB, file: boolean): void {
  if (file) db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
}

/** Dosya veritabanını açar, pragmaları ayarlar ve bekleyen migration'ları uygular. */
export function openDatabase(dbPath: string): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  applyPragmas(db, true);
  runMigrations(db);
  return db;
}

/** Testler için bellek içi, şeması hazır veritabanı. */
export function openMemoryDatabase(): DB {
  const db = new Database(":memory:");
  applyPragmas(db, false);
  runMigrations(db);
  return db;
}

export function resolveDbPath(): string {
  const fromEnv = process.env.DB_PATH;
  return fromEnv ? path.resolve(process.cwd(), fromEnv) : DEFAULT_DB_PATH;
}

// Geliştirme sırasında sıcak yeniden yüklemede tek bağlantı korunur.
const globalForDb = globalThis as unknown as { __marketPosDb?: DB };

/** Uygulama genelinde tek veritabanı bağlantısı. */
export function getDb(): DB {
  if (!globalForDb.__marketPosDb) {
    globalForDb.__marketPosDb = openDatabase(resolveDbPath());
  }
  return globalForDb.__marketPosDb;
}
