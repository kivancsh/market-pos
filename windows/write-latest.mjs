// En son sürüm bilgisi (latest.json): kurulum dosyasıyla birlikte GitHub'da yayınlanır.
// Kurulu programlar yeni sürümü buradan öğrenir; indirdikleri dosyayı boyut ve SHA-256 ile doğrular.
// Kullanım: node windows/write-latest.mjs <Setup.exe> <latest.json> "<sürüm notu>"   (MARKET_KASA_VERSION gerekli)
import crypto from "node:crypto";
import fs from "node:fs";

const [setup, out, notes = ""] = process.argv.slice(2);
const version = process.env.MARKET_KASA_VERSION;
if (!setup || !out || !/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Kullanım: MARKET_KASA_VERSION=1.1.42 node windows/write-latest.mjs <Setup.exe> <latest.json> [not]");
  process.exit(1);
}
const data = fs.readFileSync(setup);
const latest = {
  version,
  sha256: crypto.createHash("sha256").update(data).digest("hex"),
  size: data.length,
  publishedAt: new Date().toISOString(),
  notes: notes.trim().slice(0, 500) || null,
};
fs.writeFileSync(out, JSON.stringify(latest, null, 1));
console.log(JSON.stringify(latest));
