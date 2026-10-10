// En son sürüm bilgisi (latest.json): kurulum dosyasıyla birlikte GitHub'da yayınlanır.
// Kurulu programlar yeni sürümü buradan öğrenir; indirdikleri dosyayı boyut ve SHA-256 ile doğrular.
// Kullanım: node windows/write-latest.mjs <Setup.exe> <latest.json> "<sürüm notu>" [Mac.zip]   (MARKET_KASA_VERSION gerekli)
// Üst düzeydeki sha256/size Windows kurulum dosyasınındır (eski sürümler bunu okur); "mac" Mac paketinin.
import crypto from "node:crypto";
import fs from "node:fs";

const [setup, out, notes = "", macZip] = process.argv.slice(2);
const version = process.env.MARKET_KASA_VERSION;
if (!setup || !out || !/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Kullanım: MARKET_KASA_VERSION=1.1.42 node windows/write-latest.mjs <Setup.exe> <latest.json> [not]");
  process.exit(1);
}
const info = (file) => {
  const data = fs.readFileSync(file);
  return { sha256: crypto.createHash("sha256").update(data).digest("hex"), size: data.length };
};
const latest = {
  version,
  ...info(setup),
  publishedAt: new Date().toISOString(),
  notes: notes.trim().slice(0, 500) || null,
  mac: macZip ? info(macZip) : null,
};
fs.writeFileSync(out, JSON.stringify(latest, null, 1));
console.log(JSON.stringify(latest));
