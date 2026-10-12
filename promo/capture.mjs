// Tanıtım videosu için uygulama ekranlarını yakalar (ayrı demo veritabanı, port 3200).
// Kullanım: node promo/capture.mjs <çıktı klasörü>
// Sunucu MAIL_DEV_DIR ile çalışmalı (gün sonu raporu e-postası dosyaya yazılır, videoda gösterilir).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3200";
const OUT = process.argv[2] ?? "promo/shots";
const MAIL_DIR = process.env.MAIL_DEV_DIR;
if (!MAIL_DIR) throw new Error("MAIL_DEV_DIR ayarlı değil (sunucuyla aynı klasör olmalı).");
fs.mkdirSync(OUT, { recursive: true });

const OWNER = { username: "ayse", password: "demo-sifre-2026" };
const CASHIER_PIN = "2468";

const browser = await chromium.launch({ args: ["--lang=tr-TR"] });
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "tr-TR", timezoneId: "Europe/Istanbul" };

// Videoda kamera hareketi ve vurgular için önemli öğelerin konumları (CSS px, 1440×900 ekranda)
const boxes = {};
const BOX = {
  barcode: '[data-testid="barcode-input"]',
  cart: '[data-testid="cart-table"]',
  total: '[data-testid="grand-total"]',
  dialog: '[role="dialog"] > div',
  cash: '[data-testid="cash-received"]',
  change: '[data-testid="change-preview"]',
  complete: '[data-testid="complete-sale"]',
  changeAmount: '[data-testid="change-amount"]',
  kpis: '[data-testid="overview-kpis"]',
  trend: 'section:has-text("Son 30 gün ciro")',
  cashiers: '[data-testid="overview-cashiers"]',
  plTable: '[data-testid="pl-table"]',
  plNet: '[data-testid="pl-net"]',
  vat: 'section[aria-label="KDV özeti"]',
  expenseSplit: 'section[aria-label="Gider dağılımı"]',
  months: '[data-testid="pl-months"]',
  reportTable: '[data-testid="report-table"]',
  stockPlan: '[data-testid="stock-plan"]',
  heatmap: '[data-testid="heatmap"]',
  abc: '[data-testid="abc-summary"]',
  labelSheet: '[data-testid="label-sheet"]',
  auditTable: '[data-testid="audit-table"]',
};

async function shot(page, name, extra = {}) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  const b = {};
  const all = { ...BOX, ...extra };
  for (const [k, sel] of Object.entries(all)) {
    const loc = typeof sel === "string" ? page.locator(sel).first() : sel;
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

// ================================================================= Yönetici
const ownerCtx = await browser.newContext(desktop);
const o = await ownerCtx.newPage();
await o.goto(`${BASE}/login?mode=owner`);
await o.getByTestId("login-tab-owner").click();
await o.getByTestId("login-username").fill(OWNER.username);
await o.getByTestId("login-password").fill(OWNER.password);
await o.getByTestId("login-owner-submit").click();
await o.waitForURL(/\/yonetim/);
await o.request.patch(`${BASE}/api/settings`, { data: { businessName: "Köşe Market" } });

// Bu ayın giderleri (kâr-zarar ve net kâr için; gerçekçi küçük dükkân tutarları)
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
for (const [category, description, amountKurus, vatRate] of [
  ["kira", "Dükkân kirası", 450000, 0],
  ["elektrik", "Elektrik faturası", 96000, 20],
  ["iletisim", "İnternet", 72000, 20],
]) {
  const r = await o.request.post(`${BASE}/api/expenses`, { data: { businessDate: today, category, description, amountKurus, vatRate } });
  if (!r.ok()) throw new Error(`gider eklenemedi: ${await r.text()}`);
}

// Genel bakış (bu ay)
await o.goto(`${BASE}/yonetim?donem=ay`);
await o.getByTestId("overview-kpis").waitFor();
await o.waitForTimeout(1200);
const kpiCards = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`kpi${i}`, o.locator('[data-testid="overview-kpis"] > div').nth(i)]));
await shot(o, "genel-bakis", kpiCards);
// Değerler (sayaç animasyonu için metin olarak)
const kpiText = await o.locator('[data-testid="overview-kpis"] > div').evaluateAll((els) =>
  els.map((e) => ({ label: e.querySelector("p")?.textContent?.trim() ?? "", value: e.querySelectorAll("p")[1]?.textContent?.trim() ?? "" })),
);
boxes._kpiText = kpiText;

// Kâr-zarar
await o.goto(`${BASE}/yonetim/kar-zarar`);
await o.getByTestId("pl-table").waitFor();
await o.waitForTimeout(800);
await shot(o, "kar-zarar");
boxes._plNet = (await o.getByTestId("pl-net").innerText()).trim();

// Kasiyer performansı (bu ay)
await o.goto(`${BASE}/raporlar?rapor=cashiers`);
await o.getByRole("button", { name: "Bu ay" }).click();
await o.getByTestId("report-table").waitFor();
await o.waitForTimeout(900);
const rows = Object.fromEntries([0, 1, 2].map((i) => [`row${i}`, o.getByTestId("report-table").locator("tbody tr").nth(i)]));
await shot(o, "kasiyer", rows);

// Analizler: stok planı + yoğun saatler (uzun sayfa: iki ayrı görüntü)
await o.goto(`${BASE}/yonetim/analiz`);
await o.getByTestId("stock-plan").waitFor();
await o.waitForTimeout(900);
await o.getByRole("region", { name: "Stok yeterliliği ve sipariş önerisi" }).scrollIntoViewIfNeeded();
await o.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="stock-plan"]').getBoundingClientRect().top + window.scrollY - 330));
await shot(o, "stok");
await o.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="heatmap"]').getBoundingClientRect().top + window.scrollY - 200));
await shot(o, "yogun-saatler");
// ısı haritası hücreleri (dalga animasyonu için konumlar)
boxes._heatCells = await o.locator('[data-testid="heatmap"]').evaluate((hm) => {
  // [x, y, g, s, renk, satır, sütun]
  const out = [];
  hm.querySelectorAll("tbody tr").forEach((tr, row) => {
    tr.querySelectorAll("td > div").forEach((c, col) => {
      const r = c.getBoundingClientRect();
      out.push([Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), c.style.background, row, col]);
    });
  });
  return out;
});
await o.evaluate(() => window.scrollTo(0, 0));

// Montaj ekranları
await o.goto(`${BASE}/etiketler`);
await o.waitForTimeout(800);
for (const [name, n] of [["Kola 1 L", "6"], ["Cips Büyük Boy", "6"], ["Süt 1 L", "6"], ["Çay 1 kg", "6"]]) {
  await o.getByLabel(`${name} seç`).check();
  await o.getByLabel(`${name} etiket adedi`).fill(n);
}
await o.getByTestId("label-sheet").first().waitFor();
await o.waitForTimeout(1200);
await shot(o, "etiketler");

await o.goto(`${BASE}/raporlar?rapor=products`);
await o.getByRole("button", { name: "Bu ay" }).click();
await o.getByTestId("report-table").waitFor();
await o.waitForTimeout(900);
await shot(o, "raporlar");

await o.goto(`${BASE}/yonetim/islem-gecmisi`);
await o.getByTestId("audit-table").waitFor();
await shot(o, "islem-gecmisi");

// Gün sonu raporu e-postası (dosyaya yazılan e-postanın görünümü)
const since = Date.now();
const rep = await o.request.post(`${BASE}/api/reports/daily-email`, { data: {} });
if (!rep.ok()) throw new Error(`rapor gönderilemedi: ${await rep.text()}`);
let mail = null;
for (let i = 0; i < 40 && !mail; i++) {
  const files = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).filter((f) => f.endsWith(".json")).map((f) => path.join(MAIL_DIR, f)) : [];
  const fresh = files.filter((f) => fs.statSync(f).mtimeMs >= since - 50).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (fresh.length) mail = JSON.parse(fs.readFileSync(fresh[0], "utf8"));
  else await new Promise((r) => setTimeout(r, 250));
}
if (!mail) throw new Error("rapor e-postası bulunamadı");
{
  const mp = await ownerCtx.newPage();
  await mp.setViewportSize({ width: 720, height: 1100 });
  await mp.setContent(mail.html, { waitUntil: "load" });
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: path.join(OUT, "eposta.png") });
  boxes._mailSubject = mail.subject;
  await mp.close();
  console.log("✓ eposta");
}

// ================================================================= Yapay zekâ asistanı (bu ayın ara raporu)
// Gerçekçi bir toptancı zammı: alış fiyatı artar, satış fiyatı aynı kalır → asistan fiyat önerisi çıkarır
{
  const prods = (await (await o.request.get(`${BASE}/api/products`)).json()).items;
  const byName = (n) => prods.find((p) => p.name === n);
  const items = [
    ["Kola 1 L", 40, 4100],
    ["Süt 1 L", 30, 3900],
    ["Ayçiçek Yağı 1 L", 20, 9600],
  ].map(([n, qty, unitCostKurus]) => ({ productId: byName(n).id, qty, unitCostKurus }));
  const pr = await o.request.post(`${BASE}/api/purchases`, { data: { supplier: "Merkez Toptan", items } });
  if (!pr.ok()) throw new Error(`mal girişi yapılamadı: ${await pr.text()}`);
  const month = today.slice(0, 7);
  const gen = await o.request.post(`${BASE}/api/assistant/reports`, { data: { month } });
  if (!gen.ok()) throw new Error(`asistan raporu oluşturulamadı: ${await gen.text()}`);
  const data = await (await o.request.get(`${BASE}/api/assistant?month=${month}`)).json();
  const rep = data.report;
  const AREA = { ciro: "Ciro", kar: "Kârlılık", urun: "Ürünler", kategori: "Kategoriler", fiyat: "Fiyat", stok: "Stok", gider: "Giderler", zaman: "Saatler", sepet: "Sepet", iade: "İade", kasa: "Kasa", personel: "Personel" };
  const revT = data.current.targets.find((x) => x.metric === "revenue");
  boxes._ai = {
    headline: rep.ai.headline,
    scorecard: rep.ai.scorecard.map((s) => ({ label: AREA[s.area] ?? s.area, grade: s.grade })),
    // Videoda ₺ etkisi olan aksiyonlar önce (sırası korunarak)
    actions: [...rep.plan.filter((p) => p.impact?.startsWith("₺")), ...rep.plan.filter((p) => !p.impact?.startsWith("₺"))]
      .slice(0, 4)
      .map((p) => ({ title: p.title, week: p.week, impact: p.impact, priority: p.priority })),
    potential: [rep.potential.minKurus, rep.potential.maxKurus],
    target: revT ? { actual: revT.actual, target: revT.target, forecast: revT.forecast, expected: revT.expectedToDate, status: revT.status } : null,
    staff: rep.ai.staff.map((s) => ({ strengths: s.strengths.slice(0, 1), improve: s.improve.slice(0, 1) })),
  };
  await o.goto(`${BASE}/yonetim/asistan?ay=${month}`);
  await o.getByTestId("assistant-report").waitFor();
  await o.waitForTimeout(900);
  await o.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="assistant-report"]').getBoundingClientRect().top + window.scrollY - 70));
  await shot(o, "asistan", { aiHead: '[data-testid="assistant-headline"]', aiCiro: '[data-testid="area-ciro"]' });
  await o.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="assistant-plan"]').getBoundingClientRect().top + window.scrollY - 70));
  await shot(o, "asistan-plan", { aiPlan: '[data-testid="assistant-plan"]' });
  await o.evaluate(() => window.scrollTo(0, 0));
}

// ================================================================= Telefon: Genel bakış
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "tr-TR", timezoneId: "Europe/Istanbul", storageState: await ownerCtx.storageState() });
const ph = await phoneCtx.newPage();
await ph.goto(`${BASE}/yonetim?donem=ay`);
await ph.getByTestId("overview-kpis").waitFor();
await ph.waitForTimeout(1200);
await ph.setViewportSize({ width: 390, height: 1700 });
await ph.waitForTimeout(400);
await ph.screenshot({ path: path.join(OUT, "telefon.png") });
console.log("✓ telefon");

// ================================================================= Kasiyer: satış akışı
const cashCtx = await browser.newContext(desktop);
await cashCtx.addInitScript(() => window.localStorage.setItem("marketKasa.lastCashierNo", "1001"));
const c = await cashCtx.newPage();
await c.goto(`${BASE}/login`);
await c.getByTestId("login-tab-cashier").click();
await c.waitForTimeout(300);
for (const d of CASHIER_PIN) await c.keyboard.press(d);
await c.keyboard.press("Enter");
await c.waitForURL(/\/kasa/);
await c.getByTestId("barcode-input").waitFor();
await c.waitForTimeout(900);
await shot(c, "kasa-0");
const codes = ["2000000000039", "2000000000077", "2000000000114", "2000000000039"];
for (let i = 0; i < codes.length; i++) {
  await scan(c, codes[i]);
  await shot(c, `kasa-${i + 1}`, { row0: c.getByTestId("cart-row").nth(0), row1: c.getByTestId("cart-row").nth(1), row2: c.getByTestId("cart-row").nth(2) });
}
await c.keyboard.press("F8");
await c.getByTestId("cash-received").waitFor();
await shot(c, "pay-0");
await c.getByTestId("cash-received").fill("500");
await shot(c, "pay-1");
await c.getByTestId("complete-sale").click();
await c.getByTestId("sale-success").waitFor();
await c.waitForTimeout(500);
await shot(c, "pay-done");

await browser.close();
fs.writeFileSync(path.join(OUT, "boxes.json"), JSON.stringify(boxes, null, 1));
console.log("✓ konumlar:", path.join(OUT, "boxes.json"));
