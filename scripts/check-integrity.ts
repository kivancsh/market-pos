import { openDatabase, resolveDbPath } from "../src/server/db/connection";
import { findStockMismatches } from "../src/server/db/repositories/integrity";

const dbPath = resolveDbPath();
const db = openDatabase(dbPath);
const mismatches = findStockMismatches(db);
const fk = db.pragma("foreign_key_check") as unknown[];
const productCount = (db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }).c;
db.close();

console.log(`Veritabanı: ${dbPath}`);
console.log(`Kontrol edilen ürün: ${productCount}`);

let failed = false;
if (mismatches.length > 0) {
  failed = true;
  console.error(`\n❌ Stok tutarsızlığı (${mismatches.length} ürün):`);
  for (const m of mismatches) {
    console.error(`  #${m.productId} ${m.name}: stok=${m.stockQty}, hareket toplamı=${m.movementSum}`);
  }
}
if (fk.length > 0) {
  failed = true;
  console.error(`\n❌ Yabancı anahtar ihlali: ${fk.length} kayıt`);
}
if (failed) process.exit(1);
console.log("✅ Stok = hareket toplamı (tüm ürünler). Yabancı anahtarlar tutarlı.");
