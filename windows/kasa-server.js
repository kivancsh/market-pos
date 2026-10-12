// Windows paketi: sunucuyu başlatan sarmalayıcı (Optiva.exe bunu gizli pencerede çalıştırır).
// - Çıktıyı %LOCALAPPDATA%\Optiva\logs\server.log dosyasına yazar.
// - Kendi süreç numarasını (PID) dosyaya yazar; "Programı kapat" bununla durdurur.
// - Sonra Next.js'in kendi kendine yeten sunucusunu (server.js) başlatır.
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS dosyası (server.js de CommonJS) */
const fs = require("node:fs");
const path = require("node:path");

const logDir = process.env.MARKET_LOG_DIR || path.join(__dirname, "logs");
const pidFile = process.env.MARKET_PID_FILE || path.join(logDir, "server.pid");
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "server.log");
try {
  // Kayıt dosyası 5 MB'ı geçince bir öncekini sakla, yenisine başla.
  if (fs.statSync(logFile).size > 5 * 1024 * 1024) fs.renameSync(logFile, path.join(logDir, "server.old.log"));
} catch {
  // dosya henüz yok
}
const log = fs.createWriteStream(logFile, { flags: "a" });
for (const name of ["stdout", "stderr"]) {
  const stream = process[name];
  const original = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    log.write(chunk);
    try {
      return original(chunk, ...rest);
    } catch {
      return true; // görünmez konsol kapanmışsa sessizce devam
    }
  };
}
console.log(`\n[${new Date().toISOString()}] Optiva başlatılıyor (PID ${process.pid})`);

fs.writeFileSync(pidFile, String(process.pid));
const cleanup = () => {
  try {
    if (fs.readFileSync(pidFile, "utf8").trim() === String(process.pid)) fs.unlinkSync(pidFile);
  } catch {
    // zaten silinmiş
  }
};
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sig, () => process.exit(0));
process.on("uncaughtException", (e) => {
  console.error("Beklenmeyen hata:", e);
  process.exit(1);
});

// Sürüm bilgisi (güncelleme denetimi için): version.json paket derlenirken yazılır
try {
  process.env.MARKET_KASA_VERSION_INFO = fs.readFileSync(path.join(__dirname, "version.json"), "utf8");
} catch {
  // yerelde denenen paket: sürüm package.json'dan
}

require("./server.js");
