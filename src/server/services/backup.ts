import fs from "node:fs";
import path from "node:path";
import type { DB } from "../db/types";

export function backupDir(): string {
  return process.env.BACKUP_DIR
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.BACKUP_DIR)
    : path.join(process.cwd(), "backups");
}

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "YYYYMMDD-HHmm" (İstanbul saati). */
export function backupStamp(d: Date): string {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

/**
 * Çalışan veritabanının tutarlı bir kopyasını alır (SQLite online backup; WAL ile güvenli).
 * Dosya adı: backups/store-YYYYMMDD-HHmm.db (aynı dakikada ikinci yedek: -2, -3…).
 */
export async function createBackup(db: DB, now: Date, dir = backupDir()): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const base = `store-${backupStamp(now)}`;
  let file = path.join(dir, `${base}.db`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base}-${i}.db`);
  await db.backup(file);
  return file;
}

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export function listBackups(dir = backupDir()): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
