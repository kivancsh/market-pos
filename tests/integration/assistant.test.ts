import Anthropic from "@anthropic-ai/sdk";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import * as assistantRoute from "@/app/api/assistant/route";
import * as actionsRoute from "@/app/api/assistant/actions/route";
import * as aiSettingsRoute from "@/app/api/assistant/ai-settings/route";
import * as reportsRoute from "@/app/api/assistant/reports/route";
import * as aiRetryRoute from "@/app/api/assistant/reports/[month]/ai/route";
import * as targetsRoute from "@/app/api/assistant/targets/route";
import type { User } from "@/server/db/repositories/users";
import { setTestCtxFactory } from "@/server/http/api";
import { getMonthlyReportView, runScheduledMonthlyReport, type AssistantPageData, type MonthlyReportView } from "@/server/services/assistant";
import { aiErrorMessage, setTestAiRunner, type AiReport, type AiRunInput } from "@/server/services/assistant/ai";
import { getTargetProgress } from "@/server/services/assistant/targets";
import { closeDay, getDayClosingView } from "@/server/services/dayClosing";
import { createExpense } from "@/server/services/expenses";
import { createProduct } from "@/server/services/products";
import { createPurchase } from "@/server/services/purchases";
import { completeSale } from "@/server/services/sales";
import { voidSale } from "@/server/services/voids";
import { captureMail, cookieForUser, ensureUsers, TEST_CASHIER } from "../apiHelpers";
import { createEnv, expectIntegrity, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let owner: User;
let cashier: User;
let prompts: AiRunInput[];
let mail: ReturnType<typeof captureMail>;

const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};
const as = (u: User) => ({ ...env.ctx, actor: { userId: u.id, name: u.name, role: u.role } });
const sell = (u: User, items: { productId: number; qty: number }[], payment: "cash" | "card" = "cash") =>
  completeSale(as(u), { clientRequestId: uuid(), items, paymentMethod: payment }, { role: u.role });

function fakeReport(input: AiRunInput): AiReport {
  const keys = [...input.user.matchAll(/"key": "([^"]+)"/g)].map((m) => m[1]!);
  return {
    headline: "Eylül iyi geçti; Kola fiyatı güncellenmeli",
    summary: "Ciro arttı. Kasiyer 1001 iptallere dikkat etmeli.",
    scorecard: [{ area: "fiyat", grade: "zayif", comment: "Maliyet arttı." }],
    sections: [{ area: "fiyat", title: "Fiyat ve maliyet", findings: ["Kola maliyeti arttı."], opportunity: "Kola fiyatını ₺60,50 yapın." }],
    staffSummary: "Ekip iyi çalışıyor.",
    staff: [
      { alias: "Kasiyer 1001", assessment: "Hızlı ama çok iptal yapıyor.", strengths: ["Hız"], improve: ["İptal"] },
      { alias: "Uydurma Kişi", assessment: "x", strengths: [], improve: [] },
    ],
    targetsComment: "Hedefler gerçekçi.",
    actions: [
      { title: "Kola fiyatını güncelleyin", why: "Marj düştü.", steps: ["Ürünler ekranı"], expectedImpact: "—", measure: "Marj", priority: "yuksek", area: "fiyat", week: "1. hafta", ruleKey: keys.includes("price-erosion") ? "price-erosion" : null },
      { title: "Kasiyer 1001 ile iptalleri konuşun", why: "İptal yüksek.", steps: ["Görüşme"], expectedImpact: "ölçülerek görülecek", measure: "İptal oranı", priority: "orta", area: "personel", week: "2. hafta", ruleKey: "uydurma-anahtar" },
    ],
    risks: ["Ekmek stoğu bitti."],
    nextMonthFocus: "Fiyatları güncellemek.",
  };
}

/**
 * Ağustos–Eylül 2026: her gün satış; Eylül'de Kola'nın alış fiyatı artar (fiyat aynı kalır), Çikolata zararına satılır,
 * Ekmek stoğu biter, Mum hiç satılmaz, elektrik gideri artar, kasiyer sık iptal yapar, bazı günler kasa eksik çıkar.
 */
function seedTwoMonths() {
  const mk = (name: string, category: string, price: number, cost: number, stock: number, vat: 1 | 10 | 20 = 20) =>
    createProduct(env.ctx, { name, categoryName: category, salePriceKurus: price, costPriceKurus: cost, vatRate: vat, initialStock: stock, minStock: 5 });
  const kola = mk("Kola 1 L", "İçecek", 5000, 3200, 20000);
  const su = mk("Su 0,5 L", "İçecek", 1000, 600, 20000, 1);
  const cips = mk("Cips", "Atıştırmalık", 7000, 4500, 20000, 10);
  const cikolata = mk("Kampanya Çikolata", "Atıştırmalık", 1000, 1200, 5000, 10);
  const ekmek = mk("Ekmek", "Fırın", 1500, 1000, 90, 1);
  const mum = mk("Süs Mumu", "Ev", 9000, 5000, 30);

  for (const d of days("2026-08-01", "2026-09-30")) {
    if (d === "2026-09-01") {
      env.setNow(`${d}T05:00:00.000Z`);
      createPurchase(env.ctx, { items: [{ productId: kola.id, qty: 20000, unitCostKurus: 4500 }] });
    }
    const sept = d >= "2026-09-01";
    env.setNow(`${d}T06:00:00.000Z`); // 09:00
    sell(owner, [{ productId: kola.id, qty: 2 }, { productId: su.id, qty: 3 }]);
    env.setNow(`${d}T09:00:00.000Z`); // 12:00
    sell(cashier, [{ productId: cips.id, qty: 1 }, { productId: kola.id, qty: 1 }], "card");
    sell(cashier, [{ productId: cikolata.id, qty: 2 }]);
    if (d <= "2026-09-14") sell(owner, [{ productId: ekmek.id, qty: 2 }]);
    env.setNow(`${d}T15:00:00.000Z`); // 18:00 (yoğun saat)
    sell(cashier, [{ productId: kola.id, qty: sept ? 3 : 2 }, { productId: cips.id, qty: 1 }]);
    sell(owner, [{ productId: su.id, qty: 4 }]);
    if (sept && Number(d.slice(8)) % 5 === 0) {
      const v = sell(cashier, [{ productId: su.id, qty: 1 }]);
      voidSale(env.ctx, v.sale.id, { reason: "yanlış okutma" });
    }
    if (sept && Number(d.slice(8)) % 7 === 0) {
      env.setNow(`${d}T19:00:00.000Z`);
      const expected = getDayClosingView(env.ctx, d).expectedCashKurus;
      closeDay(env.ctx, { countedCashKurus: expected - 15000 });
    }
  }
  env.setNow("2026-08-01T07:00:00.000Z");
  createExpense(as(owner), { businessDate: "2026-08-01", category: "kira", amountKurus: 2000000, vatRate: 0 });
  createExpense(as(owner), { businessDate: "2026-08-20", category: "elektrik", amountKurus: 120000, vatRate: 20 });
  createExpense(as(owner), { businessDate: "2026-09-01", category: "kira", amountKurus: 2000000, vatRate: 0 });
  createExpense(as(owner), { businessDate: "2026-09-20", category: "elektrik", amountKurus: 360000, vatRate: 20 });
  return { kola, su, cips, cikolata, ekmek, mum };
}

function req(path: string, cookie: string, method = "GET", body?: unknown): Request {
  const headers = new Headers({ host: "localhost:3000", cookie });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const params = <T,>(v: T) => ({ params: Promise.resolve(v) });

let products: ReturnType<typeof seedTwoMonths>;

beforeEach(() => {
  env = createEnv("2026-07-31T09:00:00.000Z");
  ({ owner, cashier } = ensureUsers(env));
  products = seedTwoMonths();
  setTestCtxFactory(() => env.ctx);
  prompts = [];
  setTestAiRunner(async (input) => {
    prompts.push(input);
    return { report: fakeReport(input), model: "claude-opus-5-5" };
  });
  mail = captureMail();
});
afterEach(() => {
  setTestAiRunner(null);
  mail.stop();
});
afterAll(() => setTestCtxFactory(undefined));

describe("yapay zekâ asistanı — aylık rapor", () => {
  it("ay bitince raporu kendiliğinden oluşturur: her kalemin analizi, kural tabanlı aksiyonlar, hedefler, yapay zekâ yorumu, e-posta", async () => {
    env.setNow("2026-10-01T06:00:00.000Z");
    const r = await runScheduledMonthlyReport(env.ctx);
    expect(r).toEqual({ month: "2026-09", status: "emailed" });

    const v = getMonthlyReportView(env.ctx, "2026-09")!;
    expect(v.isPartial).toBe(false);
    const f = v.facts;
    expect(f.from).toBe("2026-09-01");
    expect(f.to).toBe("2026-09-30");
    expect(f.kpi.saleCount).toBeGreaterThan(150);
    expect(f.previous.month).toBe("2026-08");
    expect(f.changes.revenue).not.toBeNull();

    // Fiyat aşınması: Ağustos'ta 155 Kola satıldı → (19.845×32 + 20.000×45) / 39.845 = ₺38,53 ortalama maliyet;
    // geçen ayki %36 marjı geri getiren fiyat 38,53 / 0,64 = 60,20 → ₺60,50
    const kola = f.products.erosion.find((l) => l.name === "Kola 1 L")!;
    expect(kola).toMatchObject({ priceKurus: 5000, avgCostKurus: 3853, prevMarginPermille: 360, currentMarginPermille: 229, suggestedPriceKurus: 6050 });
    expect(kola.monthlyGainKurus).toBeGreaterThan(0);
    // Zararına satılan ürün
    expect(f.products.negativeMargin.map((l) => l.name)).toContain("Kampanya Çikolata");
    // Biten stok ve satılmayan stok
    expect(f.stock.outOfStock.map((o) => o.name)).toContain("Ekmek");
    expect(f.stock.dead.items.map((d) => d.name)).toContain("Süs Mumu");
    // Giderler: elektrik 3 ay ortalamasının üstünde
    const elec = f.expenses.byCategory.find((c) => c.category === "elektrik")!;
    expect(elec).toMatchObject({ netKurus: 300000, prevNetKurus: 100000, avg3NetKurus: 100000 });
    // Saatler ve personel
    expect(f.time.peakHours.length).toBeGreaterThan(0);
    const k1001 = f.staff.members.find((m) => m.alias === "Kasiyer 1001")!;
    expect(k1001.voidCount).toBe(6);
    expect(v.aliasNames["Kasiyer 1001"]).toBe(TEST_CASHIER.name);
    // Kasa açığı: 7, 14, 21, 28 Eylül → 4 gün × ₺150
    expect(f.cash).toMatchObject({ shortageDays: 4, shortageKurus: 60000 });

    const keys = v.ruleActions.map((a) => a.key);
    for (const k of ["price-below-cost", "price-erosion", "stock-out", "dead-stock", "expense-elektrik", "cash-shortage", "basket-size", "staff-void-Kasiyer 1001"]) expect(keys).toContain(k);
    expect(v.potential.minKurus).toBeGreaterThan(0);
    expect(v.potential.maxKurus).toBeGreaterThanOrEqual(v.potential.minKurus);

    // Yapay zekâ: gerçek kasiyer adı gitmez, takma ad gider; uydurma takma ad ve kural anahtarı temizlenir
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.user).not.toContain(TEST_CASHIER.name);
    expect(prompts[0]!.user).toContain("Kasiyer 1001");
    expect(prompts[0]!.user).toContain("₺60,50");
    expect(v.ai!.staff.map((s) => s.alias)).toEqual(["Kasiyer 1001"]);
    expect(v.ai!.actions[1]!.ruleKey).toBeNull();
    expect(v.aiModel).toBe("claude-opus-5-5");
    expect(v.plan[0]).toMatchObject({ key: "price-erosion", source: "ai", status: "open", week: "1. hafta" });
    expect(v.plan[0]!.impact).toMatch(/aylık ek kâr/);

    // Gelecek ayın hedefleri kaydedildi
    expect(v.nextTargets.map((t) => t.metric)).toEqual(expect.arrayContaining(["revenue", "gross_profit", "sale_count", "avg_basket", "margin", "expenses", "net_profit"]));
    const rev = v.nextTargets.find((t) => t.metric === "revenue")!;
    expect(rev.target).toBeGreaterThan(rev.baseline);
    expect(rev.target).toBeLessThanOrEqual(Math.ceil((rev.baseline * 108) / 100));

    // E-posta yöneticiye gitti, adlarla
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.subject).toContain("Eylül 2026");
    expect(mail.sent[0]!.html).toContain("Aylık alınabilecek aksiyonlar");
    expect(mail.sent[0]!.html).toContain(`${TEST_CASHIER.name} (Kasiyer 1001)`);

    // Tekrar çalışınca bir şey yapmaz
    expect(await runScheduledMonthlyReport(env.ctx)).toEqual({ month: "2026-09", status: "unchanged" });
    expect(mail.sent).toHaveLength(1);
    expectIntegrity(env);
  });

  it("yapay zekâ başarısız olursa rapor yine oluşur; e-posta yorumu bekler; yeniden deneme yorumu ekler", async () => {
    setTestAiRunner(async () => {
      throw new Anthropic.APIConnectionError({ message: "bağlantı yok" });
    });
    env.setNow("2026-10-01T06:00:00.000Z");
    expect(await runScheduledMonthlyReport(env.ctx)).toEqual({ month: "2026-09", status: "generated" });
    const v = getMonthlyReportView(env.ctx, "2026-09")!;
    expect(v.ai).toBeNull();
    expect(v.aiError).toMatch(/İnternet bağlantısı yok/);
    expect(v.plan[0]!.source).toBe("rule"); // kural tabanlı plan
    expect(mail.sent).toHaveLength(0);

    setTestAiRunner(async (input) => ({ report: fakeReport(input), model: "claude-opus-5-5" }));
    const cookie = await cookieForUser(owner);
    const res = await aiRetryRoute.POST(req("/api/assistant/reports/2026-09/ai", cookie, "POST", {}), params({ month: "2026-09" }));
    expect(res.status).toBe(200);
    const view = (await json(res)).report as MonthlyReportView;
    expect(view.ai?.headline).toContain("Eylül");
    expect(view.aiError).toBeNull();
  });

  it("ara rapor (ay sürerken) ay bitince son hâliyle yenilenir; aksiyon durumları sonraki aya taşınır", async () => {
    const cookie = await cookieForUser(owner);
    env.setNow("2026-09-15T12:00:00.000Z");
    const r1 = await reportsRoute.POST(req("/api/assistant/reports", cookie, "POST", { month: "2026-09" }));
    expect(r1.status).toBe(200);
    const partial = (await json(r1)).report as MonthlyReportView;
    expect(partial.isPartial).toBe(true);
    expect(partial.facts.elapsedDays).toBe(15);
    expect(partial.nextTargets).toEqual([]);

    env.setNow("2026-10-01T06:00:00.000Z");
    expect((await runScheduledMonthlyReport(env.ctx))!.status).toBe("emailed");
    const final = getMonthlyReportView(env.ctx, "2026-09")!;
    expect(final.isPartial).toBe(false);

    // Aksiyon "yapıldı"
    const done = await actionsRoute.PUT(req("/api/assistant/actions", cookie, "PUT", { month: "2026-09", key: "price-erosion", status: "done" }));
    expect(done.status).toBe(200);
    expect((await json(done)).plan.find((p: { key: string }) => p.key === "price-erosion").status).toBe("done");
    const bad = await actionsRoute.PUT(req("/api/assistant/actions", cookie, "PUT", { month: "2026-09", key: "yok", status: "done" }));
    expect(bad.status).toBe(404);

    // Ekim'de satış → Ekim ara raporu Eylül aksiyonlarını içerir
    env.setNow("2026-10-02T09:00:00.000Z");
    sell(owner, [{ productId: products.kola.id, qty: 2 }]);
    const r2 = await reportsRoute.POST(req("/api/assistant/reports", cookie, "POST", { month: "2026-10", ai: false }));
    const oct = (await json(r2)).report as MonthlyReportView;
    expect(oct.facts.priorActions?.month).toBe("2026-09");
    expect(oct.facts.priorActions?.items.find((i) => i.key === "price-erosion")?.status).toBe("done");
    expect(oct.ai).toBeNull();
    // Ekim hedefleri (Eylül raporunda kondu) ve gidişat
    expect(oct.facts.targets.map((t) => t.metric)).toContain("revenue");
  });

  it("hedef gidişatı: hafta günü ağırlıklı beklenen ve ay sonu tahmini; yönetici hedefi değiştirir; kasiyer erişemez", async () => {
    env.setNow("2026-10-01T06:00:00.000Z");
    await runScheduledMonthlyReport(env.ctx);
    for (const d of days("2026-10-01", "2026-10-10")) {
      env.setNow(`${d}T09:00:00.000Z`);
      sell(owner, [{ productId: products.kola.id, qty: 4 }, { productId: products.su.id, qty: 5 }]);
      sell(cashier, [{ productId: products.cips.id, qty: 1 }]);
    }
    const progress = getTargetProgress(env.ctx, "2026-10");
    const rev = progress.find((p) => p.metric === "revenue")!;
    expect(rev.expectedToDate).toBeGreaterThan(0);
    expect(rev.expectedToDate).toBeLessThan(rev.target);
    expect(rev.forecast).toBeGreaterThan(rev.actual);
    expect(rev.status).toBe("behind"); // günde ~₺337 satış; Eylül'ün temposunun çok altında

    const cookie = await cookieForUser(owner);
    const put = await targetsRoute.PUT(req("/api/assistant/targets", cookie, "PUT", { month: "2026-10", targets: [{ metric: "revenue", target: 1000000 }] }));
    expect(put.status).toBe(200);
    const after = (await json(put)).targets as { metric: string; target: number }[];
    expect(after.find((t) => t.metric === "revenue")!.target).toBe(1000000);
    const past = await targetsRoute.PUT(req("/api/assistant/targets", cookie, "PUT", { month: "2026-09", targets: [{ metric: "revenue", target: 1 }] }));
    expect(past.status).toBe(400);

    const page = await assistantRoute.GET(req("/api/assistant?month=2026-09", cookie));
    const data = (await json(page)) as AssistantPageData;
    expect(data.selectedMonth).toBe("2026-09");
    expect(data.current.sources.revenue).toBe("owner");
    expect(data.report?.month).toBe("2026-09");

    const cashierCookie = await cookieForUser(cashier);
    expect((await assistantRoute.GET(req("/api/assistant", cashierCookie))).status).toBe(403);
    expect((await reportsRoute.POST(req("/api/assistant/reports", cashierCookie, "POST", { month: "2026-09" }))).status).toBe(403);
    expect((await aiSettingsRoute.GET(req("/api/assistant/ai-settings", cashierCookie))).status).toBe(403);
  });

  it("anahtar: biçim denetimi, şifreli saklama, yanıtta asla dönmez", async () => {
    setTestAiRunner(null);
    const cookie = await cookieForUser(owner);
    const bad = await aiSettingsRoute.PUT(req("/api/assistant/ai-settings", cookie, "PUT", { apiKey: "yanlis" }));
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.code).toBe("BAD_KEY");
    // Gerçek anahtar denemesi yapılmaz (test çalıştırıcısı varken)
    setTestAiRunner(async (input) => ({ report: fakeReport(input), model: "claude-opus-5-5" }));
    const key = "sk-ant-test-0123456789abcdefghijKLMN";
    const ok = await aiSettingsRoute.PUT(req("/api/assistant/ai-settings", cookie, "PUT", { apiKey: key }));
    expect(ok.status).toBe(200);
    const body = await ok.text();
    expect(body).not.toContain(key);
    expect(JSON.parse(body)).toMatchObject({ configured: true, enabled: true, keyHint: "…KLMN", model: "claude-opus-5-5" });
    const stored = (env.db.prepare("SELECT value FROM settings WHERE key = 'ai_api_key_enc'").get() as { value: string }).value;
    expect(stored).not.toContain(key);
    const off = await aiSettingsRoute.PUT(req("/api/assistant/ai-settings", cookie, "PUT", { enabled: false }));
    expect((await json(off)).enabled).toBe(false);
    const removed = await aiSettingsRoute.PUT(req("/api/assistant/ai-settings", cookie, "PUT", { remove: true }));
    expect((await json(removed)).configured).toBe(false);
  });

  it("Anthropic hataları Türkçe ve anlaşılır mesaja çevrilir", () => {
    expect(aiErrorMessage(new Anthropic.APIConnectionError({ message: "x" }))).toMatch(/İnternet/);
    expect(aiErrorMessage(new Error("x"))).toBe("Yapay zekâ yorumu alınamadı.");
  });
});
