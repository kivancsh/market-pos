// Kullanma kılavuzu için ekran görüntüleri + üzerlerine konacak numaralı işaretlerin konumları.
// Ayrı demo veritabanıyla çalışan sunucuya bağlanır (port 3300; gerçek veriye dokunmaz).
// Kullanım: node docs/kilavuz/capture.mjs <çıktı klasörü>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3300";
const OUT = process.argv[2];
const DAY = process.env.GUIDE_DAY; // panel için dolu bir gün (dün)
fs.mkdirSync(OUT, { recursive: true });
const NOTES = {};
const VP = { width: 1280, height: 800 };

// --lang: saat kutusu gibi tarayıcı denetimleri Türkçe (24 saat) görünsün
const browser = await chromium.launch({ args: ["--lang=tr-TR"] });
const ctxOpts = { viewport: VP, deviceScaleFactor: 2, locale: "tr-TR", timezoneId: "Europe/Istanbul" };

async function boxOf(page, target) {
  if (!target) return null;
  if (typeof target === "object" && "x" in target) return target;
  const loc = typeof target === "string" ? page.locator(target).first() : target.first();
  if (!(await loc.count())) return null;
  return loc.boundingBox();
}

/** Görüntü al. clip: seçici/locator/dikdörtgen; notes: işaretlenecek öğeler (sırayla 1, 2, 3…). */
async function shot(page, name, { clip, pad = 12, notes = [], full = false } = {}) {
  await page.waitForTimeout(450);
  const vp = page.viewportSize();
  let r = { x: 0, y: 0, width: vp.width, height: vp.height };
  if (clip) {
    const b = await boxOf(page, clip);
    r = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad };
    r.width = Math.min(r.width, vp.width - r.x);
    if (!full) r.height = Math.min(r.height, vp.height - r.y);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: r, fullPage: full });
  const items = [];
  for (let i = 0; i < notes.length; i++) {
    const b = await boxOf(page, notes[i]);
    if (!b) { console.warn(`  ! ${name}: işaret ${i + 1} bulunamadı`); continue; }
    items.push({ n: i + 1, x: ((b.x - r.x) / r.width) * 100, y: ((b.y - r.y) / r.height) * 100, w: (b.width / r.width) * 100, h: (b.height / r.height) * 100 });
  }
  NOTES[name] = { w: r.width, h: r.height, items };
  console.log("✓", name);
}

async function scan(page, code) {
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(450);
}

function ean13(base12) {
  const d = base12.split("").map(Number);
  const s = d.reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0);
  return base12 + ((10 - (s % 10)) % 10);
}

// Demo sunucu MAIL_DEV_DIR ile çalışır: e-postalar gönderilmez, bu klasöre JSON olarak yazılır.
const MAIL_DIR = process.env.MAIL_DEV_DIR;
if (!MAIL_DIR) throw new Error("MAIL_DEV_DIR ayarlı değil (sunucuyla aynı klasör olmalı).");

/** sinceMs'ten sonra gelen en yeni e-posta (JSON: to, subject, html, ...). */
async function lastMail(sinceMs, match = () => true) {
  for (let i = 0; i < 60; i++) {
    const files = fs.existsSync(MAIL_DIR)
      ? fs.readdirSync(MAIL_DIR).filter((f) => f.endsWith(".json")).map((f) => path.join(MAIL_DIR, f))
      : [];
    const fresh = files.filter((f) => fs.statSync(f).mtimeMs >= sinceMs).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const f of fresh) {
      const m = JSON.parse(fs.readFileSync(f, "utf8"));
      if (match(m)) return m;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Beklenen e-posta gelmedi.");
}
const lastCode = async (sinceMs) => (await lastMail(sinceMs, (m) => /onay kodu: \d{6}/.test(m.subject))).subject.match(/(\d{6})/)[1];

// ================================================================= 1. İlk kurulum
const ctx = await browser.newContext(ctxOpts);
const p = await ctx.newPage();
await p.goto(`${BASE}/`);
await p.waitForURL(/\/kurulum/);
// Tek adım: ad, kullanıcı adı, şifre (e-posta isteğe bağlı, sonra Ayarlar'dan)
await p.getByTestId("setup-name").fill("Ayşe Yılmaz");
await p.getByTestId("setup-username").fill("ayse");
await p.getByTestId("setup-password").fill("demo-sifre-2026");
await p.getByTestId("setup-password2").fill("demo-sifre-2026");
await shot(p, "kurulum", { notes: ['[data-testid="setup-name"]', '[data-testid="setup-username"]', '[data-testid="setup-password"]', '[data-testid="setup-password2"]', '[data-testid="setup-submit"]'] });
let since = Date.now();
await p.getByTestId("setup-submit").click();
await p.waitForURL(/\/yonetim/);
await p.request.patch(`${BASE}/api/settings`, { data: { businessName: "Köşe Market" } });
await p.reload();
await shot(p, "yonetim-hosgeldin", { notes: [p.getByRole("status").or(p.locator(".border-emerald-300")).first(), '[data-testid="overview-email-cta"]'] });

// ================================================================= 2. Kullanıcılar
await p.goto(`${BASE}/yonetim/kullanicilar`);
await p.getByTestId("user-name").fill("Mehmet Kaya");
await p.getByTestId("user-pin").fill("2468");
await shot(p, "kullanici-ekle", { notes: [p.locator("select").first(), '[data-testid="user-name"]', '[data-testid="user-pin"]', '[data-testid="user-add"]'] });
await p.getByTestId("user-add").click();
await p.getByTestId("user-list").getByText("Mehmet Kaya").waitFor();
await shot(p, "kullanicilar", { notes: [p.getByText(/Kasiyer No: 1001/).first(), p.getByTestId("user-list").getByText("1001", { exact: true }), p.getByRole("button", { name: "PIN değiştir" }), p.getByRole("button", { name: "Pasife al" })] });

// PIN değiştirme (yöneticinin e-postası yok: kodsuz, doğrudan)
await p.getByRole("button", { name: "PIN değiştir" }).click();
await p.getByTestId("secret-new").fill("1357");
await p.getByTestId("secret-confirm").fill("1357");
await shot(p, "pin-degistir", { clip: p.getByRole("dialog").locator("> div").first(), pad: 0, notes: ['[data-testid="secret-new"]', '[data-testid="secret-confirm"]', '[data-testid="secret-save"]'] });
await p.getByTestId("secret-save").click();
await p.getByRole("dialog").waitFor({ state: "detached" });

await p.goto(`${BASE}/yonetim/hesabim`);
await shot(p, "hesabim", { notes: ['[data-testid="account-change-password"]', '[data-testid="account-email"]', '[data-testid="account-new-email"]'] });

// ================================================================= 3. Yönetici Paneli: üst menü + sol menü
await p.goto(`${BASE}/yonetim`);
const nav = p.getByRole("navigation", { name: "Ana menü" });
await shot(p, "menu", { clip: { x: 0, y: 0, width: VP.width, height: 64 }, pad: 0, notes: [nav.getByRole("link", { name: "Yönetici Paneli" }), nav.getByRole("link", { name: "Kasa", exact: true }), '[data-testid="nav-user"]', p.getByRole("button", { name: "Çıkış" })] });
{
  await p.setViewportSize({ width: 1280, height: 1000 });
  const side = p.getByTestId("owner-sidebar");
  const grp = (t) => side.getByText(t, { exact: true });
  await shot(p, "yonetim-menu", { clip: side, pad: 0, notes: [grp("Genel"), grp("Satış ve kasiyerler"), grp("Ürün ve stok"), grp("Muhasebe"), grp("Raporlar ve analiz"), grp("Hesaplar ve ayarlar")] });
  await p.setViewportSize(VP);
}

// ================================================================= 4. Giriş ekranı
await p.getByRole("button", { name: "Çıkış" }).click();
await p.waitForURL(/\/login/);
await p.getByTestId("login-tab-cashier").click();
for (const d of "100113") await p.keyboard.press(d); // No 1001 → imleç PIN'e geçer
await shot(p, "giris-kasiyer", { notes: ['[data-testid="login-tab-cashier"]', '[data-testid="login-tab-owner"]', '[data-testid="login-cashier-no"]', '[data-testid="login-pin"]', p.getByRole("button", { name: "5", exact: true }), p.getByRole("button", { name: "Giriş", exact: true })] });
await p.getByTestId("login-tab-owner").click();
// Şifremi unuttum (yönetici e-postası yok: kasa bilgisayarındaki aracı tarif eder)
await p.getByTestId("login-forgot").click();
await p.getByTestId("login-reset-help").waitFor();
await shot(p, "sifremi-unuttum", { notes: ['[data-testid="login-forgot"]', '[data-testid="login-reset-help"]'] });
await p.getByTestId("login-forgot").click();
await p.getByTestId("login-username").fill("ayse");
await p.getByTestId("login-password").fill("demo-sifre-2026");
await shot(p, "giris-yonetici", { notes: ['[data-testid="login-tab-owner"]', '[data-testid="login-username"]', '[data-testid="login-password"]', '[data-testid="login-owner-submit"]'] });
await p.getByTestId("login-owner-submit").click();
await p.waitForURL(/\/yonetim/);

// ================================================================= 5. Panel (dolu gün)
await p.goto(`${BASE}/panel${DAY ? `?date=${DAY}` : ""}`);
await p.getByTestId("summary-cards").waitFor();
await p.waitForTimeout(1200);
await shot(p, "panel", { notes: [p.locator('input[type="date"]').first(), '[data-testid="summary-cards"]', p.getByText("Saatlik satış").first(), '[data-testid="close-day"]'] });
await p.setViewportSize({ width: 1280, height: 1500 });
await p.waitForTimeout(600);
await shot(p, "panel-alt", { clip: { x: 0, y: 700, width: 1280, height: 800 }, pad: 0, notes: [p.getByText("En çok satan").first(), p.getByText("Kritik stok").first(), '[data-testid="day-sales"]'] });
await p.setViewportSize(VP);

// ================================================================= 6. Kasa (yönetici)
await p.goto(`${BASE}/kasa`);
await p.getByTestId("barcode-input").waitFor();
await p.waitForTimeout(900);
await shot(p, "kasa-bos", { notes: ['[data-testid="barcode-input"]', '[data-testid="today-stats"]', '[data-testid="grand-total"]', p.getByRole("button", { name: /NAKİT/ }), p.getByRole("button", { name: /KART/ })] });
await scan(p, "2000000000039"); // Kola
await scan(p, "2000000000077"); // Cips
await scan(p, "2000000000114"); // Süt
await scan(p, "2000000000039"); // Kola tekrar → adet 2
const row0 = p.getByTestId("cart-row").first();
await shot(p, "kasa-dolu", { notes: ['[data-testid="scan-message"]', row0, p.getByLabel("Kola 1 L adedini artır"), p.getByLabel("Kola 1 L satırını sil"), '[data-testid="discount-input"]', '[data-testid="grand-total"]', p.getByRole("button", { name: /NAKİT/ }), p.getByRole("button", { name: /Sepeti temizle/ })] });

// ürün adıyla arama
await p.getByTestId("barcode-input").click();
await p.keyboard.type("çay", { delay: 160 });
await p.waitForTimeout(500);
await shot(p, "kasa-arama", { clip: { x: 0, y: 56, width: 1060, height: 420 }, pad: 0, notes: ['[data-testid="barcode-input"]'] });
await p.getByTestId("barcode-input").fill("");

// bilinmeyen barkod
await p.getByTestId("barcode-input").click();
await scan(p, ean13("869999000001"));
await shot(p, "kasa-bilinmeyen", { clip: { x: 0, y: 56, width: 1060, height: 190 }, pad: 0, notes: [p.getByRole("button", { name: "Bu barkodla yeni ürün tanımla" })] });
await p.getByRole("button", { name: "Bu barkodla yeni ürün tanımla" }).click();
await p.getByTestId("qp-name").fill("Gazoz 250 ml");
await p.getByTestId("qp-price").fill("15,00");
await shot(p, "hizli-urun", { clip: p.getByRole("dialog").locator("> div").first(), pad: 0 });
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
if (await p.getByRole("dialog").count()) await p.getByRole("button", { name: "Vazgeç" }).first().click().catch(() => {});

// ödeme
await p.getByTestId("barcode-input").click();
await p.keyboard.press("F9");
await p.getByTestId("complete-sale").waitFor();
await shot(p, "odeme-kart", { clip: p.locator('[role="dialog"] > div').first(), pad: 0 });
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
await p.keyboard.press("F8");
await p.getByTestId("cash-received").fill("300");
await shot(p, "odeme-nakit", { clip: p.locator('[role="dialog"] > div').first(), pad: 0, notes: ['[data-testid="cash-received"]', p.getByRole("button", { name: "Tam tutar" }), '[data-testid="change-preview"]', '[data-testid="complete-sale"]'] });
await p.getByTestId("complete-sale").click();
await p.getByTestId("sale-success").waitFor();
await shot(p, "satis-tamam", { clip: '[data-testid="sale-success"] > div', pad: 0, notes: ['[data-testid="change-amount"]', p.getByRole("button", { name: /Bilgi fişi/ }), '[data-testid="new-sale"]'] });
const receiptNo = (await p.getByTestId("receipt-no").innerText()).trim();
const saleId = (await (await p.request.get(`${BASE}/api/sales/by-receipt/${receiptNo}`)).json()).id;
await p.getByTestId("new-sale").click();

// bilgi fişi
const fisPage = await ctx.newPage();
await fisPage.addInitScript(() => { window.print = () => {}; });
await fisPage.goto(`${BASE}/fis/${saleId}`);
await fisPage.waitForTimeout(800);
await shot(fisPage, "fis", { clip: "main", pad: 0 });
await fisPage.close();

// simülatör
await p.goto(`${BASE}/kasa?sim=1`);
await p.getByTestId("simulator").waitFor();
await shot(p, "simulator", { clip: '[data-testid="simulator"]', pad: 8 });

// ================================================================= 7. Ürünler
await p.goto(`${BASE}/urunler`);
await p.getByTestId("products-table").waitFor();
await shot(p, "urunler", { notes: ['[data-testid="product-search"]', p.locator("select").first(), p.getByRole("link", { name: "+ Yeni ürün" }), p.getByTestId("price-edit-3"), p.getByRole("link", { name: "Kola 1 L" })] });
await p.getByTestId("price-edit-3").click();
await p.getByTestId("price-input-3").fill("52,50");
{
  const b = await p.getByTestId("price-input-3").boundingBox();
  await shot(p, "urun-fiyat", { clip: { x: b.x - 640, y: b.y - 90, width: 900, height: 190 }, pad: 0, notes: ['[data-testid="price-input-3"]'] });
}
await p.keyboard.press("Escape");

await p.goto(`${BASE}/urunler/yeni`);
await p.getByTestId("pf-name").fill("Limonata 1 L");
await p.getByRole("button", { name: "Dükkân içi barkod üret" }).click();
await p.getByTestId("pf-price").fill("35,00");
await p.getByLabel("İlk alış fiyatı (KDV dahil)").fill("20,00");
await p.getByLabel("Kategori").fill("İçecek");
await p.getByLabel("Başlangıç stoğu").fill("24");
await p.getByLabel("Min. stok (kritik seviye)").fill("6");
await p.setViewportSize({ width: 1280, height: 1150 });
await shot(p, "yeni-urun", { notes: ['[data-testid="pf-name"]', p.getByRole("button", { name: "Dükkân içi barkod üret" }), '[data-testid="pf-price"]', p.getByLabel("İlk alış fiyatı (KDV dahil)"), p.getByRole("button", { name: "%20" }), p.getByLabel("Kategori"), p.getByLabel("Başlangıç stoğu"), '[data-testid="pf-save"]'] });
await p.getByTestId("pf-save").click();
await p.waitForURL(/\/urunler\/\d+/);
await p.waitForTimeout(800);
await shot(p, "urun-detay", { notes: [p.getByText("Ürün bilgileri").first(), p.getByText("Barkodlar").first(), p.getByRole("button", { name: "Pasife al" }), p.getByText("Stok hareketleri").first()] });
await p.setViewportSize(VP);

// ================================================================= 8. Toplu fiyat, kategoriler, etiketler
await p.goto(`${BASE}/yonetim/toplu-fiyat`);
await p.getByTestId("bulk-category").selectOption({ label: "İçecek" });
await p.getByTestId("bulk-value").fill("10");
await p.locator("select").nth(1).selectOption("end90");
await p.getByTestId("bulk-preview").click();
await p.getByTestId("bulk-table").waitFor();
await p.setViewportSize({ width: 1280, height: 1000 });
await shot(p, "toplu-fiyat", { notes: [p.getByRole("button", { name: "Bir kategori" }), '[data-testid="bulk-category"]', p.getByRole("button", { name: "Zam (artır)" }), '[data-testid="bulk-value"]', p.locator("select").nth(1), '[data-testid="bulk-preview"]', '[data-testid="bulk-table"]', '[data-testid="bulk-apply"]'] });
await p.setViewportSize(VP);

await p.goto(`${BASE}/yonetim/kategoriler`);
await p.getByTestId("cat-name").fill("Dondurma");
await shot(p, "kategoriler", { notes: ['[data-testid="cat-name"]', '[data-testid="cat-add"]', '[data-testid="cat-list"]'] });

await p.goto(`${BASE}/etiketler`);
await p.waitForTimeout(800);
for (const [name, n] of [["Kola 1 L", "6"], ["Cips Büyük Boy", "3"], ["Süt 1 L", "6"]]) {
  await p.getByLabel(`${name} seç`).check();
  await p.getByLabel(`${name} etiket adedi`).fill(n);
}
await p.getByTestId("label-sheet").first().waitFor();
await p.waitForTimeout(1000);
await shot(p, "etiketler", { notes: [p.getByText("Sütun", { exact: true }).first(), p.getByLabel("Kola 1 L seç"), p.getByLabel("Kola 1 L etiket adedi"), '[data-testid="label-sheet"]', '[data-testid="print-labels"]'] });

// ================================================================= 9. Mal girişi ve stok sayımı
await p.goto(`${BASE}/mal-girisi`);
await p.getByLabel("Tedarikçi (isteğe bağlı)").fill("Anadolu Gıda Dağıtım");
await p.getByTestId("picker-input").click();
await scan(p, "2000000000039");
await p.getByTestId("picker-input").click();
await scan(p, "2000000000114");
await p.getByLabel("Kola 1 L adet").fill("24");
await p.getByLabel("Kola 1 L birim alış fiyatı").fill("32,00");
await p.getByLabel("Süt 1 L adet").fill("12");
await p.getByLabel("Süt 1 L birim alış fiyatı").fill("30,00");
await shot(p, "mal-girisi", { notes: [p.getByLabel("Tedarikçi (isteğe bağlı)"), '[data-testid="picker-input"]', p.getByLabel("Kola 1 L adet"), p.getByLabel("Kola 1 L birim alış fiyatı"), p.getByRole("button", { name: "Mal girişini kaydet" })] });

await p.goto(`${BASE}/stok-sayim`);
await p.getByTestId("picker-input").click();
await scan(p, "2000000000190");
await p.getByLabel("Çay 1 kg sayılan adet").fill("2");
await p.getByLabel("Çay 1 kg gerekçe").selectOption("Kırık / hasarlı");
await shot(p, "stok-sayim", { notes: ['[data-testid="picker-input"]', p.getByLabel("Çay 1 kg sayılan adet"), p.getByLabel("Çay 1 kg gerekçe"), p.getByRole("button", { name: "Sayımı kaydet" })] });

// ================================================================= 10. Satış detayı, iade, gün sonu
await p.goto(`${BASE}/panel`);
await p.getByTestId("day-sales").waitFor();
await p.getByTestId("day-sales").locator("tbody tr").first().click();
await p.getByTestId("sale-detail").waitFor().catch(() => {});
await p.waitForTimeout(600);
await shot(p, "satis-detay", { clip: p.getByRole("dialog").locator("> div").first(), pad: 0, notes: ['[data-testid="start-return"]', '[data-testid="start-void"]'] });
await p.keyboard.press("Escape");

await p.goto(`${BASE}/iade`);
await p.getByTestId("receipt-input").fill(receiptNo.replace("-", ""));
await p.keyboard.press("Enter");
await p.getByTestId("sale-detail").waitFor();
await p.getByTestId("start-return").click();
await p.getByLabel("Cips Büyük Boy iade adedi").fill("1");
await p.waitForTimeout(400);
await p.setViewportSize({ width: 1280, height: 1250 });
await shot(p, "iade", { notes: ['[data-testid="receipt-input"]', p.getByLabel("Cips Büyük Boy iade adedi"), '[data-testid="refund-preview"]', '[data-testid="confirm-return"]'] });
await p.setViewportSize(VP);

await p.setViewportSize({ width: 1280, height: 1100 });
await p.goto(`${BASE}/panel`);
await p.getByTestId("close-day").click();
await p.getByTestId("counted-cash").fill("215");
await shot(p, "gun-kapat", { clip: p.getByRole("dialog").locator("> div").first(), pad: 0, notes: ['[data-testid="expected-cash"]', '[data-testid="counted-cash"]', '[data-testid="confirm-close-day"]'] });
await p.keyboard.press("Escape");
await p.setViewportSize(VP);

// ================================================================= 11. Raporlar, işlem geçmişi, ayarlar
await p.goto(`${BASE}/raporlar`);
await p.getByTestId("report-table").waitFor();
await p.waitForTimeout(900);
await shot(p, "raporlar", { notes: [p.getByRole("button", { name: "Bu ay" }), p.locator('input[type="date"]').first(), p.getByRole("tablist", { name: "Rapor türü" }), '[data-testid="export-excel"]'] });

await p.goto(`${BASE}/raporlar?rapor=cashiers`);
await p.getByRole("button", { name: "Bu ay" }).click();
await p.getByTestId("report-table").waitFor();
await p.waitForTimeout(900);
await shot(p, "kasiyer-performansi", { notes: [p.getByRole("button", { name: "Bu ay" }), p.getByRole("tab", { name: "Kasiyer performansı" }), p.getByTestId("report-table").locator("tbody tr").first(), '[data-testid="export-excel"]'] });

await p.goto(`${BASE}/yonetim/giderler`);
await p.getByTestId("expense-form").waitFor();
for (const [cat, desc, amount, vat] of [["kira", "Dükkân kirası", "4500", "0"], ["elektrik", "Elektrik faturası", "960", "20"], ["personel", "Yarı zamanlı yardımcı", "2500", "0"], ["iletisim", "İnternet", "720", "20"]]) {
  await p.getByTestId("expense-category").selectOption(cat);
  await p.getByTestId("expense-description").fill(desc);
  await p.getByTestId("expense-amount").fill(amount);
  await p.getByTestId("expense-vat").selectOption(vat);
  await p.getByTestId("expense-save").click();
  await p.getByTestId("expense-list").getByText(desc, { exact: true }).waitFor();
}
await p.getByTestId("expense-category").selectOption("su");
await p.getByTestId("expense-description").fill("Su faturası");
await p.getByTestId("expense-amount").fill("450");
await p.getByTestId("expense-vat").selectOption("10");
await p.setViewportSize({ width: 1280, height: 1000 });
await shot(p, "giderler", { notes: ['[data-testid="expense-date"]', '[data-testid="expense-category"]', '[data-testid="expense-description"]', '[data-testid="expense-amount"]', '[data-testid="expense-vat"]', '[data-testid="expense-save"]', '[data-testid="expense-list"]'] });
await p.getByTestId("expense-description").fill("");
await p.getByTestId("expense-amount").fill("");

await p.goto(`${BASE}/yonetim/kar-zarar`);
await p.getByTestId("pl-table").waitFor();
await p.setViewportSize({ width: 1280, height: 1250 });
await p.waitForTimeout(700);
await shot(p, "kar-zarar", { notes: [p.getByRole("navigation", { name: "Dönem" }), '[data-testid="pl-table"]', '[data-testid="pl-net"]', p.getByRole("region", { name: "KDV özeti" }), p.getByRole("region", { name: "Gider dağılımı" }), '[data-testid="pl-months"]'] });

await p.goto(`${BASE}/yonetim/analiz`);
await p.getByTestId("stock-plan").waitFor();
await p.setViewportSize({ width: 1280, height: 2400 });
await p.waitForTimeout(900);
await shot(p, "analiz-ust", { clip: { x: 0, y: 0, width: 1280, height: 1100 }, pad: 0, notes: [p.getByRole("navigation", { name: "Dönem" }), p.getByText(/hafta ciro/).first(), p.getByRole("region", { name: "Stok yeterliliği ve sipariş önerisi" }), p.getByRole("region", { name: "Stok yeterliliği ve sipariş önerisi" }).getByRole("link", { name: "Sipariş listesi (Excel)" }), p.getByRole("region", { name: "Stok yeterliliği ve sipariş önerisi" }).getByRole("link", { name: "Mal girişi", exact: true })] });
{
  const hm = p.getByRole("region", { name: "Yoğun saatler" });
  const abc = p.getByRole("region", { name: "ABC analizi" });
  const a = await hm.boundingBox();
  const b = await abc.boundingBox();
  const top = Math.min(a.y, b.y) - 12;
  await shot(p, "analiz-alt", { clip: { x: 0, y: top, width: 1280, height: Math.max(a.y + a.height, b.y + b.height) - top + 12 }, pad: 0, full: true, notes: ['[data-testid="heatmap"]', '[data-testid="abc-summary"]'] });
}

await p.goto(`${BASE}/yonetim?donem=ay`);
await p.getByTestId("overview-kpis").waitFor();
await p.setViewportSize({ width: 1280, height: 1700 });
await p.waitForTimeout(1200);
await shot(p, "yonetim", { notes: [p.getByRole("link", { name: "Bu ay" }), '[data-testid="overview-kpis"]', p.getByText("Son 30 gün").first(), '[data-testid="overview-cashiers"]', '[data-testid="overview-stock"]', p.getByRole("region", { name: "Hızlı işlemler" })] });
await p.setViewportSize(VP);

await p.goto(`${BASE}/yonetim/islem-gecmisi`);
await p.getByTestId("audit-table").waitFor();
await shot(p, "islem-gecmisi", { notes: [p.locator('input[type="date"]').first(), '[data-testid="audit-action"]', '[data-testid="audit-table"]'] });

await p.goto(`${BASE}/ayarlar`);
await p.setViewportSize({ width: 1280, height: 2600 });
await p.waitForTimeout(900);
const sec = (txt) => p.locator("section").filter({ hasText: txt }).first();
await shot(p, "ayarlar-isletme", { clip: sec("İşletme ve kasa"), pad: 8 });
await shot(p, "ayarlar-okuyucu", { clip: sec("Barkod okuyucu ve ses"), pad: 8 });
await shot(p, "ayarlar-rapor", { clip: sec("Günlük rapor e-postası"), pad: 8, notes: [sec("Günlük rapor e-postası").locator('input[type="checkbox"]'), '[data-testid="set-report-time"]'] });
// E-posta bağlama formu (test modunda bağlantı denenmez; adres yalnızca görüntü için)
const mailSec = sec("E-posta gönderimi");
await mailSec.getByRole("button", { name: "Hesabı değiştir" }).click();
await mailSec.locator("select").selectOption("gmail");
await mailSec.locator('input[type="email"]').fill("kosemarket.ornek@gmail.com");
await mailSec.locator('input[type="password"]').fill("abcd efgh ijkl mnop");
// Test modunda form "Vazgeç" düğmesiyle gelir; gerçek ilk bağlamada da aynı
await shot(p, "ayarlar-eposta-bagla", { clip: mailSec, pad: 8, notes: [mailSec.locator('input[type="email"]'), mailSec.locator('input[type="password"]'), '[data-testid="gmail-help"]', mailSec.getByRole("button", { name: "Bağlan ve kaydet" })] });
await mailSec.getByRole("button", { name: "Bağlan ve kaydet" }).click();
await p.getByText(/Bağlandı: e-postalar/).waitFor();
// Yöneticinin e-postası (alıcı): Hesabım'dan kodla
await p.setViewportSize(VP);
await p.goto(`${BASE}/yonetim/hesabim`);
await p.getByTestId("account-new-email").fill("ayse.ornek@gmail.com");
since = Date.now();
await p.getByRole("button", { name: /Ekle \(kod gönder\)/ }).click();
await p.getByTestId("code-input").fill(await lastCode(since));
await p.getByRole("button", { name: "Onayla" }).click();
await p.getByText(/olarak kaydedildi/).waitFor();
await p.goto(`${BASE}/ayarlar`);
await p.setViewportSize({ width: 1280, height: 2600 });
await p.waitForTimeout(900);
since = Date.now();
await p.getByTestId("send-report-now").click();
await p.getByText(/Bugünün raporu gönderildi/).waitFor();
await shot(p, "ayarlar-eposta", { clip: sec("E-posta gönderimi"), pad: 8, notes: ['[data-testid="mail-status"]', p.getByRole("button", { name: "Deneme e-postası gönder" }), '[data-testid="send-report-now"]', p.getByRole("button", { name: "Hesabı değiştir" })] });
await shot(p, "ayarlar-ice-aktar", { clip: sec("Excel'den içe aktar"), pad: 8 });
await shot(p, "ayarlar-yedek", { clip: sec("Yedekler"), pad: 8 });
await p.setViewportSize(VP);

// Gelen günlük rapor e-postasının görünümü
{
  const mail = await lastMail(since, (m) => /günlük rapor/.test(m.subject));
  const mp = await ctx.newPage();
  await mp.setViewportSize({ width: 760, height: 200 });
  await mp.setContent(mail.html, { waitUntil: "load" });
  const h = await mp.evaluate(() => document.body.scrollHeight);
  await mp.setViewportSize({ width: 760, height: Math.min(h, 2400) });
  await shot(mp, "rapor-eposta");
  await mp.close();
}

// ================================================================= 12. Telefon
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "tr-TR", timezoneId: "Europe/Istanbul", storageState: await ctx.storageState() });
const ph = await phone.newPage();
await ph.goto(`${BASE}/panel${DAY ? `?date=${DAY}` : ""}`);
await ph.getByTestId("summary-cards").waitFor();
await ph.waitForTimeout(1000);
await shot(ph, "telefon");

// ================================================================= 13. Kasiyer görünümü
const cctx = await browser.newContext(ctxOpts);
const c = await cctx.newPage();
await c.goto(`${BASE}/login`);
await c.getByTestId("login-tab-cashier").click();
for (const d of "1001") await c.keyboard.press(d);
for (const d of "1357") await c.keyboard.press(d); // PIN, kılavuzda e-posta koduyla değiştirildi
await c.keyboard.press("Enter");
await c.waitForURL(/\/kasa/);
await c.getByTestId("barcode-input").waitFor();
await c.waitForTimeout(700);
await scan(c, "2000000000046");
await scan(c, "2000000000091");
await shot(c, "kasa-kasiyer", { notes: [c.getByRole("navigation", { name: "Ana menü" }), '[data-testid="nav-user"]'] });

await browser.close();
fs.writeFileSync(path.join(OUT, "notes.json"), JSON.stringify(NOTES, null, 1));
console.log("✓ işaretler:", path.join(OUT, "notes.json"));
