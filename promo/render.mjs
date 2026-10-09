// Kurguyu kare kare çizer (Playwright/Chromium). Kullanım:
//   node promo/render.mjs <iş klasörü> preview 0.5 4.2 13.1 ...   → seçili anların PNG'si
//   node promo/render.mjs <iş klasörü> frames                     → tüm kareler (JPEG)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const [work, mode = "preview", ...times] = process.argv.slice(2);
const tl = JSON.parse(fs.readFileSync("promo/timeline.json", "utf8"));
fs.copyFileSync("assets/app-icon-1024.png", path.join(work, "icon.png"));
const boxes = JSON.parse(fs.readFileSync(path.join(work, "shots", "boxes.json"), "utf8"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.addInitScript((b) => { window.BOXES = b; }, boxes);
const url = `${pathToFileURL(path.resolve("promo/composition.html")).href}?assets=${encodeURIComponent(pathToFileURL(path.resolve(work)).href)}`;
page.on("pageerror", (e) => console.error("SAYFA HATASI:", e.message));
await page.goto(url);
await page.evaluate(() => window.ready);
await page.waitForTimeout(500);

if (mode === "preview") {
  const dir = path.join(work, "preview");
  fs.mkdirSync(dir, { recursive: true });
  for (const t of times.map(Number)) {
    await page.evaluate((tt) => window.renderFrame(tt), t);
    await page.screenshot({ path: path.join(dir, `t${t.toFixed(2)}.png`) });
  }
  console.log("✓ önizleme:", dir);
} else {
  const dir = path.join(work, "frames");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const total = Math.round(tl.duration * tl.fps);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate((tt) => window.renderFrame(tt), i / tl.fps);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 93 });
    if (i % 150 === 0) console.log(`kare ${i}/${total} (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
  }
  console.log("✓ kareler:", dir);
}
await browser.close();
