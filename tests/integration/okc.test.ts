import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as huginOrdersRoute from "@/app/hugin/v1/orders/route";
import * as huginOrderRoute from "@/app/hugin/v1/orders/[orderId]/route";
import * as huginResultRoute from "@/app/hugin/v1/orders/[orderId]/result/route";
import * as huginSalesRoute from "@/app/hugin/v1/sales/route";
import * as okcStatusRoute from "@/app/api/okc/sales/[id]/route";
import * as okcCancelRoute from "@/app/api/okc/sales/[id]/cancel/route";
import * as okcRetryRoute from "@/app/api/okc/sales/[id]/retry/route";
import * as okcSimulateRoute from "@/app/api/okc/sales/[id]/simulate/route";
import * as huginKeyRoute from "@/app/api/okc/hugin-key/route";
import * as salesRoute from "@/app/api/sales/route";
import * as settingsRoute from "@/app/api/settings/route";
import { getProductById } from "@/server/db/repositories/products";
import { getSaleById } from "@/server/db/repositories/sales";
import { setTestCtxFactory } from "@/server/http/api";
import { closeDay, getDayClosingView } from "@/server/services/dayClosing";
import { getHuginApiKey } from "@/server/services/okc";
import { updateSettings } from "@/server/services/settings";
import { cookieForUser, ensureUsers } from "../apiHelpers";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;

beforeEach(() => {
  env = createEnv("2026-10-06T09:00:00.000Z");
  p = seedSample(env);
  setTestCtxFactory(() => env.ctx);
});
afterAll(() => setTestCtxFactory(undefined));

const json = async (r: Response) => (r.status === 204 ? null : ((await r.json()) as Record<string, any>)); // eslint-disable-line @typescript-eslint/no-explicit-any
const params = <T,>(v: T) => ({ params: Promise.resolve(v) });

function api(path: string, cookie: string, method = "GET", body?: unknown): Request {
  const headers = new Headers({ host: "localhost:3000", cookie });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
/** Hugin yazar kasanın yaptığı istek (oturum yok, X-ApiKey başlığı). */
function device(path: string, key: string | null, method = "GET", body?: unknown): Request {
  const headers = new Headers({ host: "localhost:3000" });
  if (key !== null) headers.set("X-ApiKey", key);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000/hugin/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function sell(cookie: string, items: { productId: number; qty: number }[], payment: "cash" | "card" = "cash", cartDiscount?: unknown) {
  const r = await salesRoute.POST(api("/api/sales", cookie, "POST", { clientRequestId: uuid(), items, paymentMethod: payment, cartDiscount }));
  expect(r.status).toBe(200);
  return json(r) as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function setMode(mode: "off" | "manual" | "simulator" | "hugin_cloud") {
  const { owner } = ensureUsers(env);
  updateSettings({ ...env.ctx, actor: { userId: owner.id, name: owner.name, role: "owner" } }, { okcMode: mode });
}

describe("yazar kasa kapalı", () => {
  it("satış yazar kasa beklemez; Hugin uçları kapalı", async () => {
    const { cashier } = ensureUsers(env);
    const r = await sell(await cookieForUser(cashier), [{ productId: p.kola.id, qty: 1 }]);
    expect(r.okc).toBeNull();
    const key = getHuginApiKey(env.db);
    expect((await huginOrdersRoute.GET(device("/orders", key))).status).toBe(401); // bağlantı kapalı
  });
});

describe("Hugin Cloud Link", () => {
  it("satış → cihaz siparişi alır → fiş kesilir → kayıt kapanır", async () => {
    setMode("hugin_cloud");
    const { cashier } = ensureUsers(env);
    const cookie = await cookieForUser(cashier);
    const r = await sell(cookie, [{ productId: p.kola.id, qty: 2 }, { productId: p.cips.id, qty: 1 }], "card");
    const saleId = r.sale.id as number;
    expect(r.okc).toMatchObject({ status: "pending", provider: "hugin_cloud", orderId: `MK-${saleId}` });

    // şifresiz / yanlış şifreyle reddedilir
    expect((await huginOrdersRoute.GET(device("/orders", null))).status).toBe(401);
    expect((await huginOrdersRoute.GET(device("/orders", "yanlis"))).status).toBe(401);

    const key = getHuginApiKey(env.db);
    const list = await json(await huginOrdersRoute.GET(device("/orders", key)));
    expect(list!.status).toBe("SUCCESS");
    expect(list!.data.orders).toEqual([{ orderId: `MK-${saleId}`, orderTitle: `Fiş ${r.sale.receiptNo}`, amount: "170.00" }]);

    const detail = await json(await huginOrderRoute.GET(device(`/orders/MK-${saleId}`, key), params({ orderId: `MK-${saleId}` })));
    expect(detail!.data).toMatchObject({
      documentTitle: r.sale.receiptNo,
      documentDate: "20261006",
      allowedPaymentTypes: ["EFT_POS.ICC", "EFT_POS.NFC"],
      totals: { documentTotal: "170.00" },
    });
    expect(detail!.data.items).toEqual([
      expect.objectContaining({ name: "KOLA 1 L", quantity: 2, unitPrice: "50.00", amount: "100.00", vatRate: 20 }),
      expect.objectContaining({ name: "CİPS BÜYÜK BOY", quantity: 1, unitPrice: "70.00", amount: "70.00", vatRate: 10 }),
    ]);
    const st = await json(await okcStatusRoute.GET(api(`/api/okc/sales/${saleId}`, cookie), params({ id: String(saleId) })));
    expect(st!.okc.status).toBe("sent");

    // cihaz satışı bildirir (fiş ve Z numarasıyla)
    const sale = await json(
      await huginSalesRoute.POST(
        device("/sales", key, "POST", { saleType: "RECEIPT", documentTitle: r.sale.receiptNo, receiptNo: "0042", zNo: "15", totals: { documentTotal: "170.00" } }),
      ),
    );
    expect(sale!.status).toBe("SUCCESS");
    expect(sale!.data.confirmationCode).toMatch(/^[0-9a-f-]{36}$/);
    const done = await json(await okcStatusRoute.GET(api(`/api/okc/sales/${saleId}`, cookie), params({ id: String(saleId) })));
    expect(done!.okc).toMatchObject({ status: "printed", documentNo: "0042", zNo: "15" });
    // artık açık sipariş yok
    expect((await huginOrdersRoute.GET(device("/orders", key))).status).toBe(204);
    expectIntegrity(env);
  });

  it("indirimli sepet: satır tutarları toplamı belge toplamına kuruşu kuruşuna eşit", async () => {
    setMode("hugin_cloud");
    const { owner } = ensureUsers(env);
    const r = await sell(await cookieForUser(owner), [{ productId: p.kola.id, qty: 3 }, { productId: p.su.id, qty: 2 }], "cash", {
      type: "amount",
      value: 1001,
    });
    const key = getHuginApiKey(env.db);
    const d = (await json(await huginOrderRoute.GET(device(`/orders/MK-${r.sale.id}`, key), params({ orderId: `MK-${r.sale.id}` }))))!.data;
    const sum = d.items.reduce((a: number, i: { amount: string }) => a + Math.round(Number(i.amount) * 100), 0);
    expect(sum).toBe(r.sale.totalKurus);
    expect(d.totals.documentTotal).toBe("159.99");
    expect(d.allowedPaymentTypes).toEqual(["CASH"]);
    expect(d.footerNotes[0]).toBe("TOPLAM İNDİRİM: 10.01 TL");
  });

  it("cihaz hata bildirir → tekrar gönder → yine olmazsa kasiyer iptal eder, stok geri gelir", async () => {
    setMode("hugin_cloud");
    const { cashier } = ensureUsers(env);
    const cookie = await cookieForUser(cashier);
    const stockBefore = getProductById(env.db, p.kola.id)!.stockQty;
    const r = await sell(cookie, [{ productId: p.kola.id, qty: 2 }]);
    const id = String(r.sale.id);
    const key = getHuginApiKey(env.db);

    const res = await huginResultRoute.POST(
      device(`/orders/MK-${id}/result`, key, "POST", { code: "ERR_RECEIPT_LIMIT_EXCEEDED", title: "Fiş limiti aşıldı", description: "Fatura kullanılması zorunludur." }),
      params({ orderId: `MK-${id}` }),
    );
    expect(res.status).toBe(200);
    let st = (await json(await okcStatusRoute.GET(api(`/api/okc/sales/${id}`, cookie), params({ id }))))!.okc;
    expect(st).toMatchObject({ status: "failed", errorMessage: "Fiş limiti aşıldı: Fatura kullanılması zorunludur." });
    // hatalı sipariş cihaz listesinde görünmez
    expect((await huginOrdersRoute.GET(device("/orders", key))).status).toBe(204);

    st = (await json(await okcRetryRoute.POST(api(`/api/okc/sales/${id}/retry`, cookie, "POST"), params({ id }))))!.okc;
    expect(st.status).toBe("pending");
    expect((await json(await huginOrdersRoute.GET(device("/orders", key))))!.data.orders).toHaveLength(1);

    st = (await json(await okcCancelRoute.POST(api(`/api/okc/sales/${id}/cancel`, cookie, "POST"), params({ id }))))!.okc;
    expect(st.status).toBe("cancelled");
    expect(getSaleById(env.db, r.sale.id)!.status).toBe("voided");
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(stockBefore);
    // kesilmiş fiş iptal edilemez / iptal edilmiş tekrar iptal edilemez
    expect((await okcCancelRoute.POST(api(`/api/okc/sales/${id}/cancel`, cookie, "POST"), params({ id }))).status).toBe(409);
    expectIntegrity(env);
  });

  it("satış kaydı başlıksız gelirse açık siparişle tutardan eşleşir; eşleşmeyen kayıt işlem geçmişine yazılır", async () => {
    setMode("hugin_cloud");
    const { owner } = ensureUsers(env);
    const r = await sell(await cookieForUser(owner), [{ productId: p.cips.id, qty: 1 }]);
    const key = getHuginApiKey(env.db);
    await huginOrderRoute.GET(device(`/orders/MK-${r.sale.id}`, key), params({ orderId: `MK-${r.sale.id}` }));
    await huginSalesRoute.POST(device("/sales", key, "POST", { totals: { documentTotal: "70.00" }, fiscalReceiptNo: 77 }));
    const st = env.db.prepare("SELECT status, document_no AS d FROM okc_documents WHERE sale_id = ?").get(r.sale.id);
    expect(st).toEqual({ status: "printed", d: "77" });

    const res = await json(await huginSalesRoute.POST(device("/sales", key, "POST", { totals: { documentTotal: "999.00" } })));
    expect(res!.status).toBe("SUCCESS");
    expect(env.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'okc.unmatched'").get()).toEqual({ n: 1 });
  });

  it("bağlantı şifresi yalnız yöneticiye görünür; yenilenince eskisi geçersiz", async () => {
    setMode("hugin_cloud");
    const { owner, cashier } = ensureUsers(env);
    expect((await huginKeyRoute.GET(api("/api/okc/hugin-key", await cookieForUser(cashier)))).status).toBe(403);
    const oc = await cookieForUser(owner);
    const k1 = (await json(await huginKeyRoute.GET(api("/api/okc/hugin-key", oc))))!.key as string;
    expect(k1.length).toBeGreaterThanOrEqual(30);
    const k2 = (await json(await huginKeyRoute.POST(api("/api/okc/hugin-key", oc, "POST"))))!.key as string;
    expect(k2).not.toBe(k1);
    expect((await huginOrdersRoute.GET(device("/orders", k1))).status).toBe(401);
    expect((await huginOrdersRoute.GET(device("/orders", k2))).status).toBe(204);
  });
});

describe("simülatör ve ayarlar", () => {
  it("simülatörde ödeme alınır / hata verilir; Pavo henüz seçilemez", async () => {
    setMode("simulator");
    const { owner, cashier } = ensureUsers(env);
    const cookie = await cookieForUser(cashier);
    const a = await sell(cookie, [{ productId: p.su.id, qty: 1 }]);
    const ok = (await json(await okcSimulateRoute.POST(api(`/api/okc/sales/${a.sale.id}/simulate`, cookie, "POST", { outcome: "paid" }), params({ id: String(a.sale.id) }))))!.okc;
    expect(ok).toMatchObject({ status: "printed", documentNo: "0001" });
    const b = await sell(cookie, [{ productId: p.su.id, qty: 1 }]);
    const bad = (await json(await okcSimulateRoute.POST(api(`/api/okc/sales/${b.sale.id}/simulate`, cookie, "POST", { outcome: "error" }), params({ id: String(b.sale.id) }))))!.okc;
    expect(bad).toMatchObject({ status: "failed", errorMessage: "Kâğıt bitti (simülasyon)" });

    const r = await settingsRoute.PATCH(api("/api/settings", await cookieForUser(owner), "PATCH", { okcMode: "pavo_rest" }));
    expect(r.status).toBe(400);
  });
});

describe("gün sonu: yazar kasa Z toplamı ve veri sağlığı", () => {
  it("fark %5'i aşarsa uyarı; fişi kesilmemiş satışlar sayılır", async () => {
    setMode("simulator");
    const { owner } = ensureUsers(env);
    const ctx = { ...env.ctx, actor: { userId: owner.id, name: owner.name, role: "owner" as const } };
    const cookie = await cookieForUser(owner);
    await sell(cookie, [{ productId: p.kola.id, qty: 2 }]); // 100,00 — fişi kesilmedi
    let v = getDayClosingView(ctx, "2026-10-06");
    expect(v.okc).toMatchObject({ mode: "simulator", unprintedCount: 1, zTotalKurus: null, appTotalKurus: 10000, unhealthy: false });

    v = closeDay(ctx, { countedCashKurus: 10000, okcZTotalKurus: 9000 });
    expect(v.okc).toMatchObject({ zTotalKurus: 9000, differencePermille: 100, unhealthy: true });
    const ok = getDayClosingView(ctx, "2026-10-06");
    expect(ok.okc.zTotalKurus).toBe(9000);
  });
});
