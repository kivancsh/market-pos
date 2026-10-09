// Kılavuzu PDF'e çevirir. Kullanım: node docs/kilavuz/build-pdf.mjs <görsel klasörü (jpg + notes.json + icon.png)> <çıktı.pdf>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const [imgDir, out] = process.argv.slice(2);
const notes = JSON.parse(fs.readFileSync(path.join(imgDir, "notes.json"), "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript((n) => { window.NOTES = n; }, notes);
page.on("pageerror", (e) => console.error("SAYFA HATASI:", e.message));
const url = `${pathToFileURL(path.resolve("docs/kilavuz/kilavuz.html")).href}?img=${encodeURIComponent(pathToFileURL(path.resolve(imgDir)).href)}`;
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => window.ready);
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate: '<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 14mm;display:flex;justify-content:space-between;font-family:-apple-system,Helvetica,Arial"><span>Market Kasa · Kullanma Kılavuzu</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
});
await browser.close();
console.log("✓", out);
