/**
 * npm run seed — veritabanını SIFIRLAR ve örnek verilerle doldurur.
 * Güvenlik: veritabanında satış varsa silmeden önce backups/ klasörüne yedek alınır.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { formatTRY } from "../src/lib/money";
import { openDatabase, resolveDbPath } from "../src/server/db/connection";
import { findStockMismatches } from "../src/server/db/repositories/integrity";
import { barcodesToCsv, runSeed } from "../src/server/seed/seed";

function stampForFile(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function backupIfHasSales(dbPath: string): Promise<string | null> {
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true });
  try {
    const hasSalesTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sales'").get();
    const sales = hasSalesTable ? (db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).c : 0;
    if (sales === 0) return null;
    const dir = path.join(process.cwd(), "backups");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `store-before-seed-${stampForFile(new Date())}.db`);
    await db.backup(target);
    return target;
  } finally {
    db.close();
  }
}

async function main() {
  const dbPath = resolveDbPath();
  const backup = await backupIfHasSales(dbPath);
  if (backup) console.log(`Mevcut veritabanının yedeği alındı: ${path.relative(process.cwd(), backup)}`);

  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
  const db = openDatabase(dbPath);

  const started = Date.now();
  const result = runSeed(db);
  const mismatches = findStockMismatches(db);
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_kurus),0) AS ciro, COALESCE(SUM(gross_profit_kurus),0) AS kar
         FROM sales WHERE status = 'completed'`,
    )
    .get() as { n: number; ciro: number; kar: number };
  db.close();

  const csvPath = path.join(path.dirname(dbPath), "seed-barcodes.csv");
  fs.writeFileSync(csvPath, barcodesToCsv(result.barcodes));

  console.log("\nÜRÜN BARKODLARI");
  console.log("No  Barkod          Tür         Ürün");
  for (const b of result.barcodes) {
    console.log(
      `${String(b.no).padStart(2)}  ${b.barcode.padEnd(14)}  ${(b.type === "internal" ? "dükkân içi" : "üretici").padEnd(10)}  ${b.name}${b.isPrimary ? "" : "  (ek barkod)"}`,
    );
  }
  console.log(`\nÖzet (${result.firstDay} → ${result.lastDay}):`);
  console.log(`  Ürün: ${result.products}, barkod: ${result.barcodes.length}`);
  console.log(`  Satış: ${result.sales} (iptal ${result.voids}, kısmi iade ${result.returns}), mal girişi yapılan gün: ${result.purchases}`);
  console.log(`  Geçerli satışların cirosu: ${formatTRY(totals.ciro)}, brüt kâr (KDV hariç): ${formatTRY(totals.kar)}`);
  console.log(`  Barkod listesi: ${path.relative(process.cwd(), csvPath)}`);
  console.log(`  Süre: ${((Date.now() - started) / 1000).toFixed(1)} sn`);
  if (mismatches.length > 0) {
    console.error("❌ Stok tutarsızlığı:", mismatches);
    process.exit(1);
  }
  console.log("✅ Stok = hareket toplamı (tüm ürünler)");
}

main().catch((e) => {
  console.error("Seed başarısız:", e);
  process.exit(1);
});
