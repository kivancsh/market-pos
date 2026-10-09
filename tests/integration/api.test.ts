import { sealData } from "iron-session";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as barcodeRoute from "@/app/api/barcodes/[code]/route";
import * as catalogRoute from "@/app/api/catalog/route";
import * as loginRoute from "@/app/api/auth/login/route";
import * as meRoute from "@/app/api/auth/me/route";
import * as productsRoute from "@/app/api/products/route";
import * as purchasesRoute from "@/app/api/purchases/route";
import * as returnsRoute from "@/app/api/returns/route";
import * as saleRoute from "@/app/api/sales/[id]/route";
import * as voidRoute from "@/app/api/sales/[id]/void/route";
import * as salesRoute from "@/app/api/sales/route";
import * as settingsRoute from "@/app/api/settings/route";
import * as adjustRoute from "@/app/api/stock/adjust/route";
import * as todayRoute from "@/app/api/today-stats/route";
import { resetLimiterForTests } from "@/server/auth/loginLimiter";
import { getSessionSecret } from "@/server/auth/secret";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";
import { setTestCtxFactory } from "@/server/http/api";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;

beforeEach(() => {
  env = createEnv();
  p = seedSample(env);
  setTestCtxFactory(() => env.ctx);
  resetLimiterForTests();
});
afterAll(() => setTestCtxFactory(undefined));

async function cookieFor(role: "owner" | "cashier"): Promise<string> {
  const seal = await sealData({ role, loginAt: new Date().toISOString() }, { password: getSessionSecret(), ttl: SESSION_TTL_SECONDS });
  return `${SESSION_COOKIE}=${seal}`;
}

function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; origin?: string } = {}): Request {
  const headers = new Headers({ host: "localhost:3000" });
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.origin) headers.set("origin", opts.origin);
  return new Request(`http://localhost:3000${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const params = <T>(v: T) => ({ params: Promise.resolve(v) });
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe("giriş", () => {
  it("doğru PIN ile rol döner ve HttpOnly çerez yazılır", async () => {
    const r = await loginRoute.POST(req("/api/auth/login", { body: { pin: "4321" } }));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ role: "owner" });
    const setCookie = r.headers.get("set-cookie")!;
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const r2 = await loginRoute.POST(req("/api/auth/login", { body: { pin: "8765" } }));
    expect(await json(r2)).toEqual({ role: "cashier" });
  });

  it("çerezle /me rolü döndürür; varsayılan PIN kullanılmıyor", async () => {
    const r = await meRoute.GET(req("/api/auth/me", { cookie: await cookieFor("owner") }));
    expect(await json(r)).toEqual({ role: "owner", defaultPins: false });
  });

  it("hatalı PIN 401; 5 hatalı denemeden sonra doğru PIN de 5 dk kilitli (429)", async () => {
    for (let i = 0; i < 4; i++) {
      const r = await loginRoute.POST(req("/api/auth/login", { body: { pin: "1111" } }));
      expect(r.status).toBe(401);
      expect(((await json(r)).error as { code: string }).code).toBe("WRONG_PIN");
    }
    const fifth = await loginRoute.POST(req("/api/auth/login", { body: { pin: "1111" } }));
    expect(fifth.status).toBe(429);
    const locked = await loginRoute.POST(req("/api/auth/login", { body: { pin: "4321" } }));
    expect(locked.status).toBe(429);
    expect(locked.headers.get("set-cookie")).toBeNull();
  });

  it("başka siteden gelen (Origin uyuşmayan) istek reddedilir", async () => {
    const r = await loginRoute.POST(req("/api/auth/login", { body: { pin: "4321" }, origin: "http://evil.example" }));
    expect(r.status).toBe(403);
  });

  it("bozuk JSON 400 döner, hata biçimi tutarlı", async () => {
    const r = await loginRoute.POST(
      new Request("http://localhost:3000/api/auth/login", { method: "POST", body: "{bozuk", headers: { host: "localhost:3000" } }),
    );
    expect(r.status).toBe(400);
    expect(await json(r)).toEqual({ error: { code: "INVALID_JSON", message: "Gönderilen veri okunamadı." } });
  });
});

describe("yetkilendirme (sunucu tarafında)", () => {
  it("oturumsuz istek 401", async () => {
    expect((await catalogRoute.GET(req("/api/catalog"))).status).toBe(401);
    expect((await salesRoute.POST(req("/api/sales", { body: {} }))).status).toBe(401);
  });

  it("sahte / bozuk çerez 401", async () => {
    const r = await catalogRoute.GET(req("/api/catalog", { cookie: `${SESSION_COOKIE}=Fe26.2**sahte` }));
    expect(r.status).toBe(401);
  });

  it("kasiyer maliyet/kâr içeren veya yönetici uçlarına erişemez (403)", async () => {
    const c = await cookieFor("cashier");
    const checks: [string, Promise<Response>][] = [
      ["sale detail", saleRoute.GET(req("/api/sales/1", { cookie: c }), params({ id: "1" }))],
      ["void", voidRoute.POST(req("/api/sales/1/void", { cookie: c, body: { reason: "x" } }), params({ id: "1" }))],
      ["returns", returnsRoute.POST(req("/api/returns", { cookie: c, body: {} }))],
      ["purchases", purchasesRoute.POST(req("/api/purchases", { cookie: c, body: {} }))],
      ["adjust", adjustRoute.POST(req("/api/stock/adjust", { cookie: c, body: {} }))],
      ["products", productsRoute.POST(req("/api/products", { cookie: c, body: {} }))],
    ];
    for (const [name, pr] of checks) {
      const r = await pr;
      expect(r.status, name).toBe(403);
    }
  });

  it("kasiyerin katalog, barkod, ayar ve bugün yanıtlarında maliyet/kâr/ciro YOK", async () => {
    const c = await cookieFor("cashier");
    const bodies = [
      await (await catalogRoute.GET(req("/api/catalog", { cookie: c }))).text(),
      await (await barcodeRoute.GET(req("/api/barcodes/8690000000005", { cookie: c }), params({ code: "8690000000005" }))).text(),
      await (await settingsRoute.GET(req("/api/settings", { cookie: c }))).text(),
      await (await todayRoute.GET(req("/api/today-stats", { cookie: c }))).text(),
    ];
    for (const b of bodies) expect(b).not.toMatch(/cost|profit|revenue|allowNegative/i);
    expect(JSON.parse(bodies[0]!).items).toHaveLength(4);
  });

  it("kasiyerin satış yanıtında maliyet/kâr alanları hiç yok; owner'da var", async () => {
    const body = () => ({ clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 1 }], paymentMethod: "card" });
    const rc = await salesRoute.POST(req("/api/sales", { cookie: await cookieFor("cashier"), body: body() }));
    expect(rc.status).toBe(200);
    const text = await rc.text();
    expect(text).not.toMatch(/cost|profit/i);
    expect(JSON.parse(text).sale.receiptNo).toBe("20261006-0001");

    const ro = await salesRoute.POST(req("/api/sales", { cookie: await cookieFor("owner"), body: body() }));
    const owner = (await ro.json()) as { sale: { grossProfitKurus: number } };
    expect(owner.sale.grossProfitKurus).toBe(1500); // net 4167 − maliyet net 2667
  });

  it("owner bugünkü ciroyu görür, kasiyer sadece adedi", async () => {
    await salesRoute.POST(
      req("/api/sales", {
        cookie: await cookieFor("cashier"),
        body: { clientRequestId: uuid(), items: [{ productId: p.su.id, qty: 2 }], paymentMethod: "cash" },
      }),
    );
    const o = await json(await todayRoute.GET(req("/api/today-stats", { cookie: await cookieFor("owner") })));
    const c = await json(await todayRoute.GET(req("/api/today-stats", { cookie: await cookieFor("cashier") })));
    expect(o).toEqual({ date: "2026-10-06", saleCount: 1, revenueKurus: 2000, dayClosed: false });
    expect(c).toEqual({ date: "2026-10-06", saleCount: 1, dayClosed: false });
  });
});

describe("API iş akışları", () => {
  it("hata yanıtları Türkçe ve tek biçimde (yetersiz stok 409)", async () => {
    const r = await salesRoute.POST(
      req("/api/sales", {
        cookie: await cookieFor("owner"),
        body: { clientRequestId: uuid(), items: [{ productId: p.cay.id, qty: 10 }], paymentMethod: "card" },
      }),
    );
    expect(r.status).toBe(409);
    const b = (await r.json()) as { error: { code: string; message: string; details: unknown } };
    expect(b.error.code).toBe("INSUFFICIENT_STOCK");
    expect(b.error.message).toContain("Çay 1 kg");
    expect(b.error.details).toBeDefined();
    expectIntegrity(env);
  });

  it("barkod ucu: üretici barkodu, hatalı kontrol basamağı, bilinmeyen", async () => {
    const c = await cookieFor("cashier");
    const get = async (code: string) =>
      json(await barcodeRoute.GET(req(`/api/barcodes/${encodeURIComponent(code)}`, { cookie: c }), params({ code: encodeURIComponent(code) })));
    expect(await get("8690000000005")).toMatchObject({ status: "found", product: { id: p.su.id, name: "Su 0,5 L" } });
    expect(await get("8690000000006")).toMatchObject({ status: "invalid", reason: "invalid_check_digit" });
    expect(await get("4006381333931")).toEqual({ status: "not_found", code: "4006381333931" });
  });

  it("owner hızlı ürün tanımlar; yanıt katalog öğesi içerir", async () => {
    const r = await productsRoute.POST(
      req("/api/products", {
        cookie: await cookieFor("owner"),
        body: { name: "Yeni Ürün", salePriceKurus: 2500, costPriceKurus: 1500, vatRate: 10, initialStock: 5, barcodes: [{ barcode: "4006381333931" }] },
      }),
    );
    expect(r.status).toBe(200);
    const b = (await r.json()) as { catalogItem: { barcodes: string[]; stockQty: number } };
    expect(b.catalogItem).toMatchObject({ barcodes: ["4006381333931"], stockQty: 5 });
    expectIntegrity(env);
  });
});
