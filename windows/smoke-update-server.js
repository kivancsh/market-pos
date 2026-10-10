// Sadece Windows kurulum testi için (pakete girmez): GitHub'ın yerine geçen küçük dosya sunucusu.
// Klasördeki latest.json, Market-Kasa-Setup.exe ve Market-Kasa-Mac.zip dosyalarını verir; program "yeni sürüm"ü buradan bulur.
// Kullanım: node windows/smoke-update-server.js <klasör> <port>
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS betiği */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const [dir, port] = process.argv.slice(2);
const FILES = new Set(["latest.json", "Market-Kasa-Setup.exe", "Market-Kasa-Mac.zip"]);

http
  .createServer((req, res) => {
    const name = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\/+/, ""));
    if (!FILES.has(name)) {
      res.writeHead(404).end();
      return;
    }
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    res.writeHead(200, {
      "content-type": name.endsWith(".json") ? "application/json" : "application/octet-stream",
      "content-length": stat.size,
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(port), "127.0.0.1", () => console.log(`güncelleme deneme sunucusu: http://127.0.0.1:${port}`));
