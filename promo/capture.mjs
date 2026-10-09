// Tanıtım videosu için uygulama ekranlarını yakalar (ayrı demo veritabanı, port 3200).
// Kullanım: node promo/capture.mjs <çıktı klasörü>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3200";
const OUT = process.argv[2] ?? "promo/shots";
fs.mkdirSync(OUT, { recursive: true });

const OWNER = { username: "ayse", password: "demo-sifre-2026" };
const CASHIER_PIN = "2468";
const YESTERDAY = process.env.PROMO_DAY; // panel için dolu bir gün

const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "tr-TR", timezoneId: "Europe/Istanbul" };

// Videoda kamera yakınlaştırması için önemli öğelerin konumları (CSS px)
const boxes = {};
const BOX_SELECTORS = {
  pinCard: "main > div",
  barcode: '[data-testid="barcode-input"]',
  cart: '[data-testid="cart-table"]',
  total: '[data-testid="grand-total"]',
  scanMsg: '[data-testid="scan-message"]',
  dialog: '[role="dialog"]',
  cash: '[data-testid="cash-received"]',
  change: '[data-testid="change-preview"]',
  complete: '[data-testid="complete-sale"]',
  changeAmount: '[data-testid="change-amount"]',
  cards: '[data-testid="summary-cards"]',
  daySales: '[data-testid="day-sales"]',
  bulkTable: '[data-testid="bulk-table"]',
  bulkApply: '[data-testid="bulk-apply"]',
  priceInput: '[data-testid="price-input-3"]',
  tileBulk: '[data-testid="tile-/yonetim/toplu-fiyat"]',
  tileUsers: '[data-testid="tile-/yonetim/kullanicilar"]',
  labelSheet: '[data-testid="label-sheet"]',
  reportTable: '[data-testid="report-table"]',
  auditTable: '[data-testid="audit-table"]',
  userList: '[data-testid="user-list"]',
};

async function shot(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const b = {};
  for (const [k, sel] of Object.entries(BOX_SELECTORS)) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) && (await loc.isVisible())) {
      const r = await loc.boundingBox();
      if (r) b[k] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
  }
  boxes[name] = b;
  console.log("✓", name);
}

async function scan(page, code) {
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
}

// ---- Yönetici oturumu: ayarlar + yönetim ekranları
const ownerCtx = await browser.newContext(desktop);
const o = await ownerCtx.newPage();
await o.goto(`${BASE}/login?mode=owner`);
await shot(o, "login-owner");
await o.getByTestId("login-username").fill(OWNER.username);
await o.getByTestId("login-password").fill(OWNER.password);
await o.getByTestId("login-owner-submit").click();
await o.waitForURL(/\/panel/);
// işletme adı
await o.request.put(`${BASE}/api/settings`, { data: { businessName: "Köşe Market" } }).catch(() => {});
await o.request.patch(`${BASE}/api/settings`, { data: { businessName: "Köşe Market" } }).catch(() => {});

await o.goto(`${BASE}/panel${YESTERDAY ? `?date=${YESTERDAY}` : ""}`);
await o.getByTestId("card-gross").waitFor();
await o.waitForTimeout(1200);
await shot(o, "panel");

await o.goto(`${BASE}/yonetim`);
await shot(o, "yonetim");

await o.goto(`${BASE}/urunler`);
await o.getByTestId("products-table").waitFor();
await shot(o, "urunler");
// fiyatı yerinde değiştirme
await o.getByTestId("price-edit-3").click();
await o.getByTestId("price-input-3").fill("57,50");
await shot(o, "urunler-price-edit");
await o.keyboard.press("Escape");

await o.goto(`${BASE}/yonetim/toplu-fiyat`);
await o.getByTestId("bulk-category").selectOption({ label: "İçecek" });
await o.getByTestId("bulk-value").fill("10");
await o.locator("select").nth(1).selectOption("end90");
await o.getByTestId("bulk-preview").click();
await o.getByTestId("bulk-table").waitFor();
await shot(o, "toplu-fiyat");

await o.goto(`${BASE}/raporlar`);
await o.getByTestId("report-table").waitFor();
await o.waitForTimeout(800);
await shot(o, "raporlar");

await o.goto(`${BASE}/etiketler`);
await o.waitForTimeout(800);
for (const [name, n] of [["Kola 1 L", "6"], ["Cips Büyük Boy", "6"], ["Süt 1 L", "6"], ["Çay 1 kg", "6"]]) {
  await o.getByLabel(`${name} seç`).check();
  await o.getByLabel(`${name} etiket adedi`).fill(n);
}
await o.getByTestId("label-sheet").first().waitFor();
await o.waitForTimeout(1200);
await shot(o, "etiketler");

await o.goto(`${BASE}/mal-girisi`);
await o.waitForTimeout(500);
await shot(o, "mal-girisi");

await o.goto(`${BASE}/yonetim/kullanicilar`);
await shot(o, "kullanicilar");

await o.goto(`${BASE}/yonetim/islem-gecmisi`);
await o.getByTestId("audit-table").waitFor();
await shot(o, "islem-gecmisi");

// ---- Telefon: panel
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "tr-TR", timezoneId: "Europe/Istanbul", storageState: await ownerCtx.storageState() });
const ph = await phoneCtx.newPage();
await ph.goto(`${BASE}/panel${YESTERDAY ? `?date=${YESTERDAY}` : ""}`);
await ph.getByTestId("card-gross").waitFor();
await ph.waitForTimeout(1200);
await shot(ph, "phone-panel");

// ---- Kasiyer oturumu: giriş + satış akışı
const cashCtx = await browser.newContext(desktop);
const c = await cashCtx.newPage();
await c.goto(`${BASE}/login`);
await c.getByTestId("login-tab-cashier").click();
await c.waitForTimeout(300);
await shot(c, "login-pin-0");
for (let i = 0; i < CASHIER_PIN.length; i++) {
  await c.keyboard.press(CASHIER_PIN[i]);
  await shot(c, `login-pin-${i + 1}`);
}
await c.keyboard.press("Enter");
await c.waitForURL(/\/kasa/);
await c.getByTestId("barcode-input").waitFor();
await c.waitForTimeout(800);
await shot(c, "kasa-0");
const codes = ["2000000000039", "2000000000077", "2000000000114", "2000000000039"];
for (let i = 0; i < codes.length; i++) {
  await scan(c, codes[i]);
  await shot(c, `kasa-${i + 1}`);
}
await c.keyboard.press("F8");
await c.getByTestId("cash-received").waitFor();
await shot(c, "pay-0");
await c.getByTestId("cash-received").fill("500");
await shot(c, "pay-1");
await c.getByTestId("complete-sale").click();
await c.waitForTimeout(900);
await shot(c, "pay-done");

await browser.close();
fs.writeFileSync(path.join(OUT, "boxes.json"), JSON.stringify(boxes, null, 1));
