// Windows kurulum paketinin dosyalarını build/win klasörüne toplar.
// Önce: NEXT_OUTPUT=standalone npm run build   (isteğe bağlı NEXT_DIST_DIR=.next-win)
// Kullanım: node windows/build.mjs
// Windows'ta çalışınca node.exe de pakete eklenir (GitHub Actions bu şekilde çalıştırır).
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const distDir = process.env.NEXT_DIST_DIR || ".next";
const standalone = path.join(root, distDir, "standalone");
const out = path.join(root, "build", "win");
const app = path.join(out, "app");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error(`Bulunamadı: ${path.join(distDir, "standalone", "server.js")}. Önce: NEXT_OUTPUT=standalone npm run build`);
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1) Next.js sunucusu + statik dosyalar
fs.cpSync(standalone, app, { recursive: true });
fs.cpSync(path.join(root, distDir, "static"), path.join(app, distDir, "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), path.join(app, "public"), { recursive: true });

// 2) Kişisel veriler ASLA pakete girmez (Next bazen proje klasöründen kopyalıyor)
for (const p of ["data", "backups", ".env", ".env.local", ".env.production", ".claude", "test-results", "playwright-report"]) {
  fs.rmSync(path.join(app, p), { recursive: true, force: true });
}

// 3) Veritabanı şeması (migration) dosyaları: sunucu çalışma klasörüne göre okur
fs.rmSync(path.join(app, "src"), { recursive: true, force: true });
fs.cpSync(path.join(root, "src", "server", "db", "migrations"), path.join(app, "src", "server", "db", "migrations"), { recursive: true });

// 4) better-sqlite3: hazır derlenmiş Windows ikilisi paket içinde geliyor; tamamını (kaynaksız) koy
const bsqSrc = path.join(root, "node_modules", "better-sqlite3");
const bsqDst = path.join(app, "node_modules", "better-sqlite3");
fs.rmSync(bsqDst, { recursive: true, force: true });
fs.mkdirSync(bsqDst, { recursive: true });
for (const p of ["package.json", "LICENSE", "lib", "prebuilds"]) fs.cpSync(path.join(bsqSrc, p), path.join(bsqDst, p), { recursive: true });

// 5) Sunucu sarmalayıcısı ve komut satırı araçları (şifre sıfırlama, yedek)
fs.copyFileSync(path.join(root, "windows", "kasa-server.js"), path.join(app, "kasa-server.js"));
for (const [name, entry] of [["users-cli", "scripts/users-cli.ts"], ["backup", "scripts/backup.ts"]]) {
  await build({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(app, "tools", `${name}.js`),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["better-sqlite3"],
    logLevel: "warning",
  });
}

// 5b) Sürüm bilgisi: program güncelleme denetimini bununla yapar (GitHub'da MARKET_KASA_VERSION = 1.1.<derleme no>)
const version = process.env.MARKET_KASA_VERSION;
if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Geçersiz MARKET_KASA_VERSION: ${version}`);
  process.exit(1);
}
if (!version && process.env.CI) {
  console.error("MARKET_KASA_VERSION ayarlı değil (GitHub'da derlerken gerekli).");
  process.exit(1);
}
if (version) {
  const info = { version, commit: process.env.GITHUB_SHA ?? null, builtAt: new Date().toISOString() };
  fs.writeFileSync(path.join(app, "version.json"), JSON.stringify(info, null, 1));
  console.log(`Sürüm: ${version}`);
}

// 6) Kısayol dosyaları ve simge
for (const f of ["Yonetici Sifresi Sifirla.cmd", "Yedek Al.cmd", "MarketKasa.ico"]) {
  fs.copyFileSync(path.join(root, "windows", f), path.join(out, f));
}

// 7) Node.js çalışma ortamı (sadece Windows'ta derlerken)
if (process.platform === "win32") {
  fs.mkdirSync(path.join(out, "node"), { recursive: true });
  fs.copyFileSync(process.execPath, path.join(out, "node", "node.exe"));
}

// 8) Güvenlik kontrolü: veritabanı/yedek/gizli dosya kalmadığından emin ol
const bad = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(db|db-wal|db-shm|sqlite)$/i.test(e.name) || /^\.env/.test(e.name) || e.name === "session-secret") bad.push(p);
  }
})(out);
if (bad.length) {
  console.error("Pakette olmaması gereken dosyalar var:\n" + bad.join("\n"));
  process.exit(1);
}

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`✓ build/win hazır (${(size(out) / 1024 / 1024).toFixed(1)} MB)`);
