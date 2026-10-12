// Müşterilere gönderilecek kullanım demosu: uygulamayı gerçek bir kullanıcı gibi kullanır ve ekranı kaydeder.
// Ayrı demo veritabanıyla çalışan sunucuya bağlanır (port 3400; gerçek veriye dokunmaz).
// Kullanım: node promo/kullanim-demosu/record.mjs <çalışma klasörü>
// Çıktı: <klasör>/raw/*.jpg (ekran kareleri, zaman damgalı), <klasör>/timeline.json (kareler, kesilen beklemeler, ses olayları)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3400";
const OUT = process.argv[2];
if (!OUT) throw new Error("Kullanım: node promo/kullanim-demosu/record.mjs <çalışma klasörü>");
const RAW = path.join(OUT, "raw");
fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });

const OWNER = { username: "ayse", password: "demo-sifre-2026" };
const CASHIER = { no: "1001", pin: "2468" };
// 1440×810 CSS px, 4/3 ölçekle 1920×1080 kare (yazılar videoda okunaklı)
const VP = { width: 1440, height: 810 };
const LOGO = `data:image/svg+xml;base64,${fs.readFileSync(new URL("../../assets/app-icon.svg", import.meta.url)).toString("base64")}`;

// Tempo: bütün beklemeler bu oranla kısalır (video 90 sn'yi geçmesin)
const SPEED = 0.88;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));
const now = () => Date.now();

// ------------------------------------------------------------------ hazırlık (kayıttan önce, API ile)
const browser = await chromium.launch({ args: ["--lang=tr-TR", "--hide-scrollbars"] });
{
  const prep = await browser.newContext({ locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const r = prep.request;
  const login = await r.post(`${BASE}/api/auth/login`, { data: { mode: "owner", username: OWNER.username, password: OWNER.password } });
  if (!login.ok()) throw new Error(`giriş olmadı: ${await login.text()}`);
  await r.patch(`${BASE}/api/settings`, { data: { businessName: "Köşe Market" } });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  // Ay başına yazılır: bugünün net kârını bozmasın (Genel bakış "Bugün")
  const monthStart = `${today.slice(0, 8)}01`;
  for (const [category, description, amountKurus, vatRate] of [
    ["kira", "Dükkân kirası", 450000, 0],
    ["iletisim", "İnternet", 72000, 20],
  ]) {
    const e = await r.post(`${BASE}/api/expenses`, { data: { businessDate: monthStart, category, description, amountKurus, vatRate } });
    if (!e.ok()) throw new Error(`gider eklenemedi: ${await e.text()}`);
  }
  // Toptancı zammı (alış artar, satış fiyatı aynı) → yapay zekâ asistanı fiyat önerisi çıkarır
  const prods = (await (await r.get(`${BASE}/api/products`)).json()).items;
  const byName = (n) => prods.find((p) => p.name === n);
  const items = [
    ["Süt 1 L", 30, 3900],
    ["Ayçiçek Yağı 1 L", 20, 9600],
  ].map(([n, qty, unitCostKurus]) => ({ productId: byName(n).id, qty, unitCostKurus }));
  const pr = await r.post(`${BASE}/api/purchases`, { data: { supplier: "Merkez Toptan", items } });
  if (!pr.ok()) throw new Error(`mal girişi yapılamadı: ${await pr.text()}`);
  await prep.close();
}

// ------------------------------------------------------------------ kayıt katmanı (imleç, tıklama halkası, alt yazı, açılış/kapanış)
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 4 / 3, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
await ctx.addInitScript(
  ({ logo }) => {
    const KEY = "__demo";
    const st = () => {
      try {
        return JSON.parse(sessionStorage.getItem(KEY) || "{}");
      } catch {
        return {};
      }
    };
    const save = (patch) => {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ ...st(), ...patch }));
      } catch {}
    };
    const css = `
      #__demo { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
      #__demo .cur { position: absolute; left: 0; top: 0; width: 26px; height: 32px; transform: translate(-3px,-2px); filter: drop-shadow(0 3px 5px rgba(0,0,0,.35)); transition: none; }
      #__demo .ring { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 3px solid #10b981; background: rgba(16,185,129,.25); animation: __ring .55s ease-out forwards; }
      @keyframes __ring { to { transform: scale(3.2); opacity: 0; } }
      #__demo .cap { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; max-width: 1180px;
        padding: 12px 26px 12px 12px; border-radius: 20px; background: rgba(6,12,24,.86); box-shadow: 0 18px 40px rgba(0,0,0,.35), 0 0 0 1px rgba(52,211,153,.35); color: #fff;
        backdrop-filter: blur(8px); transition: opacity .35s, transform .35s; }
      #__demo .cap.hide { opacity: 0; transform: translate(-50%, 16px); }
      #__demo .cap .n { flex: none; min-width: 46px; height: 46px; padding: 0 10px; border-radius: 14px; background: linear-gradient(135deg,#10b981,#047857); display: grid; place-items: center; font-weight: 850; font-size: 20px; }
      #__demo .cap .t { font-size: 13px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #6ee7b7; }
      #__demo .cap .s { font-size: 23px; font-weight: 650; line-height: 1.25; margin-top: 2px; }
      #__demo .cap .s b { color: #fbbf24; font-weight: 800; }
      #__demo .brand { position: absolute; right: 18px; bottom: 30px; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: 999px; background: rgba(6,12,24,.72); color: #fff; font-weight: 800; font-size: 15px; letter-spacing: .02em; }
      #__demo .brand img { width: 26px; height: 26px; border-radius: 7px; }
      #__demo .card { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse at 50% 40%, #0c1a2c 0%, #060c18 55%, #03060c 100%); color: #fff; transition: opacity .6s; text-align: center; }
      #__demo .card.hide { opacity: 0; }
      #__demo.carded .cur { opacity: 0; }
      #__demo .card img { display: block; margin: 0 auto; width: 150px; height: 150px; border-radius: 34px; box-shadow: 0 30px 80px rgba(16,185,129,.35); }
      #__demo .card .wm { font-size: 92px; font-weight: 900; letter-spacing: -.02em; margin-top: 22px; line-height: 1; }
      #__demo .card .wm span { background: linear-gradient(90deg,#6ee7b7,#10b981 45%,#fbbf24); -webkit-background-clip: text; background-clip: text; color: transparent; }
      #__demo .card .l1 { margin-top: 18px; font-size: 30px; color: #cbd5e1; font-weight: 500; }
      #__demo .card .pill { display: inline-block; margin-top: 26px; padding: 10px 22px; border-radius: 999px; background: rgba(16,185,129,.14); border: 1px solid rgba(52,211,153,.45); color: #6ee7b7; font-weight: 800; letter-spacing: .14em; font-size: 16px; }
      #__demo .card .row { margin-top: 26px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
      #__demo .card .row span { padding: 9px 18px; border-radius: 12px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); font-size: 20px; font-weight: 700; }
      #__demo .card .row span:last-child { background: rgba(251,191,36,.14); border-color: rgba(251,191,36,.5); color: #fde68a; }
    `;
    const arrow = `<svg viewBox="0 0 26 32" width="26" height="32"><path d="M3 2 L3 25 L9 19.5 L13 29 L17.2 27.2 L13.3 18 L21.5 18 Z" fill="#fff" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/></svg>`;
    let root, cur, cap;
    function build() {
      if (!document.documentElement) return;
      if (root && root.isConnected) return;
      root = document.createElement("div");
      root.id = "__demo";
      root.innerHTML = `<style>${css}</style><div class="brand"><img src="${logo}">Optiva</div><div class="cap hide"><div class="n"></div><div><div class="t"></div><div class="s"></div></div></div><div class="cur">${arrow}</div>`;
      document.documentElement.appendChild(root);
      cur = root.querySelector(".cur");
      cap = root.querySelector(".cap");
      const s = st();
      if (s.x != null) cur.style.transform = `translate(${s.x - 3}px, ${s.y - 2}px)`;
      if (s.cap) setCaption(s.cap, true);
      if (s.card) showCard(s.card, true);
    }
    function setCaption(c, instant) {
      save({ cap: c });
      if (!cap) return;
      const fill = () => {
        if (!c) return;
        cap.querySelector(".n").textContent = c.n;
        cap.querySelector(".t").textContent = c.t;
        cap.querySelector(".s").innerHTML = c.s;
      };
      if (instant) {
        fill();
        cap.classList.toggle("hide", !c);
        return;
      }
      cap.classList.add("hide");
      setTimeout(() => {
        fill();
        if (c) cap.classList.remove("hide");
      }, 260);
    }
    function showCard(html, instant) {
      save({ card: html });
      let card = root.querySelector(".card");
      root.classList.toggle("carded", !!html);
      if (!html) {
        if (card) {
          card.classList.add("hide");
          setTimeout(() => card.remove(), 700);
        }
        return;
      }
      if (!card) {
        card = document.createElement("div");
        card.className = "card" + (instant ? "" : " hide");
        root.insertBefore(card, cur);
      }
      card.innerHTML = html.replaceAll("{logo}", logo);
      if (!instant) requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove("hide")));
    }
    window.__demoCaption = setCaption;
    window.__demoCard = showCard;
    addEventListener(
      "mousemove",
      (e) => {
        build();
        if (cur) cur.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`;
        save({ x: e.clientX, y: e.clientY });
      },
      true,
    );
    addEventListener(
      "mousedown",
      (e) => {
        build();
        const r = document.createElement("div");
        r.className = "ring";
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        root.appendChild(r);
        setTimeout(() => r.remove(), 700);
      },
      true,
    );
    // React sayfayı yeniden çizince katman düşerse geri tak
    setInterval(build, 120);
    addEventListener("DOMContentLoaded", build);
  },
  { logo: LOGO },
);

const page = await ctx.newPage();
await page.addInitScript(() => {
  window.print = () => {};
});

// ------------------------------------------------------------------ ekran kaydı (CDP screencast)
const frames = [];
const cuts = [];
const events = [];
const cdp = await ctx.newCDPSession(page);
let frameNo = 0;
cdp.on("Page.screencastFrame", (f) => {
  const file = `${String(frameNo++).padStart(6, "0")}.jpg`;
  frames.push({ t: f.metadata.timestamp * 1000, file });
  fs.writeFile(path.join(RAW, file), Buffer.from(f.data, "base64"), () => {});
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});

// ------------------------------------------------------------------ kullanıcı hareketleri
let mouse = { x: VP.width * 0.62, y: VP.height * 0.55 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const ev = (type, extra = {}) => events.push({ t: now(), type, ...extra });

/** Bekleme videodan kesilir (sayfa yüklemesi gibi): izleyen anında görür. */
async function cut(fn) {
  const a = now();
  const r = await fn();
  await sleep(120);
  cuts.push([a, now()]);
  return r;
}
async function moveTo(x, y, ms) {
  const d = Math.hypot(x - mouse.x, y - mouse.y);
  const dur = ms ?? Math.min(620, Math.max(240, d * 0.68));
  const steps = Math.max(8, Math.round(dur / 16));
  const sx = mouse.x;
  const sy = mouse.y;
  // hafif kavis: insan eli düz çizmez
  const bend = Math.min(60, d * 0.12) * (sx < x ? 1 : -1);
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    const arc = Math.sin(Math.PI * k) * bend;
    await page.mouse.move(sx + (x - sx) * k, sy + (y - sy) * k - arc);
    await sleep(dur / steps);
  }
  mouse = { x, y };
}
async function boxOf(target) {
  const loc = typeof target === "string" ? page.locator(target).first() : target.first();
  await loc.waitFor({ state: "visible", timeout: 15000 });
  await loc.scrollIntoViewIfNeeded();
  return loc.boundingBox();
}
async function hover(target, { fx = 0.5, fy = 0.5, ms } = {}) {
  const b = await boxOf(target);
  await moveTo(b.x + b.width * fx, b.y + b.height * fy, ms);
}
async function click(target, opts = {}) {
  await hover(target, opts);
  await sleep(90);
  ev("click");
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(opts.after ?? 220);
}
async function type(text, delay = 75) {
  for (const ch of text) {
    ev("key");
    await page.keyboard.type(ch);
    await sleep(delay * (0.75 + Math.random() * 0.5));
  }
}
async function fillField(target, text, delay) {
  await click(target, { after: 120 });
  await page.keyboard.press("ControlOrMeta+A");
  await type(text, delay);
}
async function scan(code) {
  ev("scan");
  await page.keyboard.type(code, { delay: 4 });
  await page.keyboard.press("Enter");
  await sleep(650);
}
async function key(k, after = 300) {
  ev("key");
  await page.keyboard.press(k);
  await sleep(after);
}
async function wheel(dy, ms = 700) {
  const steps = Math.max(6, Math.round(ms / 30));
  let done = 0;
  for (let i = 1; i <= steps; i++) {
    const target = Math.round(dy * ease(i / steps));
    await page.mouse.wheel(0, target - done);
    done = target;
    await sleep(ms / steps);
  }
}
async function caption(n, t, s) {
  if (n) ev("chapter", { n, title: t });
  await page.evaluate((c) => window.__demoCaption?.(c), n ? { n, t, s } : null);
}
async function card(html) {
  await page.evaluate((h) => window.__demoCard?.(h), html);
}
const side = (label) => page.getByTestId("owner-sidebar").getByRole("link", { name: label, exact: true });
/** Sol menüden bir ekrana geç (yükleme kesilir). */
async function menu(label, ready) {
  await click(side(label), { after: 0 });
  await cut(async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
    if (ready) await page.locator(ready).first().waitFor({ timeout: 20000 });
    await sleep(250);
  });
}

// ================================================================== KAYIT
await page.goto(`${BASE}/login`);
await page.getByTestId("login-cashier-no").or(page.getByRole("tab").first()).first().waitFor();
await page.mouse.move(mouse.x, mouse.y);
await card(`<div><img src="{logo}"><div class="wm">Opti<span>va</span></div><div class="l1">Yapay zekâ destekli akıllı işletme yönetimi</div><div class="pill">KULLANIM DEMOSU · 1 DAKİKADA OPTİVA</div></div>`);
await sleep(900);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const START = now();
ev("intro");
await sleep(2900);
await card(null);
ev("whoosh");
await sleep(500);

// ---------------------------------------------------------------- 1. Kasiyer girişi
await caption("1", "Kasiyer girişi", "Kasiyer, <b>Kasiyer No</b> ve <b>PIN</b> ile saniyeler içinde girer");
await click(page.getByRole("tab", { name: /Kasiyer/ }), { after: 250 });
for (const d of CASHIER.no + CASHIER.pin) await click(page.getByRole("button", { name: d, exact: true }), { after: 70, ms: 230 });
await click(page.getByRole("button", { name: "Giriş", exact: true }), { after: 0 });
await cut(async () => {
  await page.waitForURL(/\/kasa/);
  await page.getByTestId("barcode-input").waitFor();
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(400);
});

// ---------------------------------------------------------------- 2. Satış
await caption("2", "Satış", "Barkodu okutun, ürün <b>anında</b> sepete düşer");
await sleep(500);
await scan("2000000000039"); // Kola
await scan("2000000000077"); // Cips
await scan("2000000000114"); // Süt
await caption("2", "Satış", "Barkodsuz ürünü <b>adıyla</b> bulun, adedi tek tıkla artırın");
await click('[data-testid="barcode-input"]', { after: 100 });
await type("bisküvi", 95);
await sleep(350);
await click(page.getByRole("option").first(), { after: 450 });
await click(page.getByLabel("Kola 1 L adedini artır"), { after: 500 });
await caption("2", "Satış", "<b>F8</b> nakit, <b>F9</b> kart — alınan parayı yazın, para üstü hazır");
await key("F8", 450);
await page.getByTestId("cash-received").waitFor();
await sleep(400);
await type("500", 140);
await sleep(700);
await click('[data-testid="complete-sale"]', { after: 0 });
await page.getByTestId("sale-success").waitFor();
ev("success");
await caption("2", "Satış", "Satış tamam: <b>stok, kâr ve kasa</b> kendiliğinden güncellenir");
await sleep(1900);
await click('[data-testid="new-sale"]', { after: 300 });

// ---------------------------------------------------------------- 3. Yönetici: genel bakış
await caption("3", "Yönetici paneli", "Yönetici kendi şifresiyle girer");
await click(page.getByRole("button", { name: "Çıkış" }), { after: 0 });
await cut(async () => {
  await page.waitForURL(/\/login/);
  await page.waitForLoadState("networkidle").catch(() => {});
});
await click(page.getByRole("tab", { name: /Yönetici/ }), { after: 200 });
await click('[data-testid="login-username"]', { after: 80 });
await type(OWNER.username, 70);
await click('[data-testid="login-password"]', { after: 80 });
await type(OWNER.password, 30);
await click('[data-testid="login-owner-submit"]', { after: 0 });
await cut(async () => {
  await page.waitForURL(/\/yonetim/);
  await page.getByTestId("overview-kpis").waitFor();
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(500);
});
await caption("3", "Genel bakış", "Ciro, brüt kâr, gider ve <b>net kâr</b> tek ekranda");
await hover('[data-testid="overview-kpis"]', { fx: 0.3, fy: 0.5 });
await sleep(700);
await hover('[data-testid="overview-kpis"]', { fx: 0.8, fy: 0.5 });
await wheel(380, 900);
await sleep(900);

// ---------------------------------------------------------------- 4. Ürünler, mal girişi, etiketler
await caption("4", "Ürün ve stok", "Fiyatı listeden <b>tek tıkla</b> değiştirin");
await menu("Ürünler ve fiyatlar", '[data-testid="products-table"]');
await click('[data-testid="product-search"]', { after: 80 });
await type("kola", 90);
await sleep(400);
await click('[data-testid="price-edit-3"]', { after: 150 });
await page.keyboard.press("ControlOrMeta+A");
await type("52,50", 110);
await key("Enter", 900);

await caption("4", "Mal girişi", "Okutun, adet ve alış fiyatını yazın — <b>maliyet otomatik</b> hesaplanır");
await menu("Mal girişi", '[data-testid="picker-input"]');
await click('[data-testid="picker-input"]', { after: 100 });
await scan("2000000000039");
await fillField(page.getByLabel("Kola 1 L adet"), "24", 120);
await fillField(page.getByLabel("Kola 1 L birim alış fiyatı"), "32,00", 100);
await sleep(300);
await click('[data-testid="save-purchase"]', { after: 900 });
ev("success");

await caption("4", "Barkod etiketleri", "Raf etiketlerini <b>barkodlu</b> hazırlayıp yazdırın");
await menu("Barkod etiketleri");
await click(page.getByLabel("Kola 1 L seç"), { after: 250 });
await click(page.getByLabel("Cips Büyük Boy seç"), { after: 250 });
await hover('[data-testid="label-sheet"]', { fx: 0.4, fy: 0.3 });
await sleep(900);

// ---------------------------------------------------------------- 5. Bugün, iade, gün sonu
await caption("5", "Bugün ve gün sonu", "Günün satışları, saatlik grafik ve <b>gün sonu kasa sayımı</b>");
await menu("Bugün ve gün sonu", '[data-testid="summary-cards"]');
await sleep(600);
await click('[data-testid="close-day"]', { after: 300 });
await fillField('[data-testid="counted-cash"]', "1500", 110);
await hover('[data-testid="expected-cash"]');
await sleep(1100);
await key("Escape", 350);
await caption("5", "İade ve iptal", "Fişi açın, <b>iade</b> ya da <b>iptal</b> tek tıkla");
await wheel(520, 800);
await click(page.getByTestId("day-sales").locator("tbody tr").first(), { after: 300 });
await page.getByTestId("sale-detail").waitFor().catch(() => {});
await hover('[data-testid="start-return"]');
await sleep(1100);
await key("Escape", 300);

// ---------------------------------------------------------------- 6. Giderler ve kâr-zarar
await caption("6", "Giderler", "Kira, fatura, maaş… giderleri girin");
await menu("Giderler", '[data-testid="expense-form"]');
await click('[data-testid="expense-category"]', { after: 100 });
await page.getByTestId("expense-category").selectOption("elektrik");
await key("Escape", 100);
await fillField('[data-testid="expense-description"]', "Elektrik faturası", 45);
await fillField('[data-testid="expense-amount"]', "960", 110);
await click('[data-testid="expense-save"]', { after: 600 });
ev("success");
await caption("6", "Kâr-zarar", "Kâr-zarar ve <b>KDV özeti</b> kendiliğinden hazır");
await menu("Kâr-zarar", '[data-testid="pl-table"]');
await hover('[data-testid="pl-net"]');
await sleep(900);
await wheel(420, 900);
await sleep(700);

// ---------------------------------------------------------------- 7. Kasiyer performansı, raporlar
await caption("7", "Kasiyer performansı", "Kim ne sattı, ne kadar kâr getirdi — <b>Excel'e tek tık</b>");
await menu("Kasiyer performansı", '[data-testid="report-table"]');
await click(page.getByRole("button", { name: "Bu ay" }), { after: 500 });
await hover(page.getByTestId("report-table").locator("tbody tr").first(), { fx: 0.3 });
await sleep(700);
await hover('[data-testid="export-excel"]');
await sleep(700);

// ---------------------------------------------------------------- 8. Analizler
await caption("8", "Analizler", "Yoğun saatler, ABC analizi ve <b>sipariş önerisi</b>");
await menu("Analizler", '[data-testid="stock-plan"]');
await sleep(500);
await wheel(560, 1100);
await sleep(700);
await wheel(640, 1100);
await sleep(900);

// ---------------------------------------------------------------- 9. Yapay zekâ asistanı
await caption("9", "Yapay zekâ asistanı", "Tek tıkla aylık rapor: <b>notlar, gerçekçi hedef, aksiyon planı</b>");
await menu("Yapay zekâ asistanı", '[data-testid="assistant-targets"]');
{
  const month = page.getByTestId("assistant-month");
  const current = await month.locator("option", { hasText: "(bu ay)" }).getAttribute("value");
  if ((await month.inputValue()) !== current) {
    await cut(async () => {
      await month.selectOption(current);
      await page.getByTestId("assistant-empty").or(page.getByTestId("assistant-report")).first().waitFor();
    });
  }
}
await hover('[data-testid="assistant-targets"]', { fx: 0.3, fy: 0.4 });
await sleep(500);
await click('[data-testid="assistant-generate"]', { after: 0 });
ev("magic");
await page.getByTestId("assistant-report").waitFor({ timeout: 60000 });
await sleep(400);
await page.evaluate(() => window.scrollTo({ top: document.querySelector('[data-testid="assistant-report"]').getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" }));
await sleep(1300);
await hover('[data-testid="assistant-headline"]', { fx: 0.35 });
await sleep(900);
await caption("9", "Yapay zekâ asistanı", "Her alana not, ekip değerlendirmesi ve <b>₺ etkili aksiyonlar</b>");
await wheel(520, 1000);
await sleep(600);
await page.evaluate(() => window.scrollTo({ top: document.querySelector('[data-testid="assistant-plan"]').getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" }));
await sleep(1200);
await hover(page.getByTestId("plan-action").first(), { fx: 0.4, fy: 0.3 });
await sleep(700);
await caption("9", "Yapay zekâ asistanı", "Hesap gerektirmez, <b>internetsiz çalışır</b>, her ay kendiliğinden hazırlanır");
await wheel(380, 900);
await sleep(1200);

// ---------------------------------------------------------------- 10. Kullanıcılar, ayarlar
await caption("10", "Kullanıcılar ve ayarlar", "Kasiyer ekleyin, yetkileri yönetin; <b>gün sonu raporu ve yedek</b> otomatik");
await menu("Kullanıcılar", '[data-testid="user-list"]');
await hover('[data-testid="user-list"]', { fx: 0.3, fy: 0.3 });
await sleep(800);
await menu("Ayarlar ve yedekler", '[data-testid="set-report-time"]');
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="set-report-time"]').closest("section") ?? document.querySelector('[data-testid="set-report-time"]');
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
});
await sleep(1300);
await hover('[data-testid="set-report-time"]');
await sleep(900);

// ---------------------------------------------------------------- kapanış
await caption(null);
await card(`<div><img src="{logo}"><div class="wm">Opti<span>va</span></div><div class="l1">Küçük işletmeler için yapay zekâ destekli akıllı işletme yönetimi</div><div class="row"><span>Satış</span><span>Stok</span><span>Finans</span><span>Ekip</span><span>Yapay zekâ</span></div><div class="pill">WINDOWS VE MAC · İNTERNETSİZ ÇALIŞIR</div></div>`);
ev("outro");
await new Promise((r) => setTimeout(r, 3800)); // kapanış kartı tempo oranından bağımsız
const END = now();
await cdp.send("Page.stopScreencast");
await sleep(500);

fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify({ start: START, end: END, frames, cuts, events }, null, 1));
const cutMs = cuts.filter(([a]) => a >= START).reduce((s, [a, b]) => s + (b - a), 0);
console.log(`✓ ${frames.length} kare, kayıt ${((END - START) / 1000).toFixed(1)} sn, kesilen ${(cutMs / 1000).toFixed(1)} sn → video ≈ ${((END - START - cutMs) / 1000).toFixed(1)} sn`);
await browser.close();
