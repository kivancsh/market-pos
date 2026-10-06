import { sealData } from "iron-session";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as availabilityRoute from "@/app/api/barcodes/availability/route";
import * as missingRoute from "@/app/api/barcodes/generate-missing/route";
import * as svgRoute from "@/app/api/barcodes/svg/route";
import * as barcodeItemRoute from "@/app/api/products/[id]/barcodes/[barcodeId]/route";
import * as productBarcodesRoute from "@/app/api/products/[id]/barcodes/route";
import * as productRoute from "@/app/api/products/[id]/route";
import * as productsRoute from "@/app/api/products/route";
import * as adjustRoute from "@/app/api/stock/adjust/route";
import * as movementsRoute from "@/app/api/stock/movements/route";
import { getSessionSecret } from "@/server/auth/secret";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";
import { getProductById } from "@/server/db/repositories/products";
import { setTestCtxFactory } from "@/server/http/api";
import { completeSale } from "@/server/services/sales";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;
beforeEach(() => {
  env = createEnv();
  p = seedSample(env);
  setTestCtxFactory(() => env.ctx);
});
afterAll(() => setTestCtxFactory(undefined));

async function cookie(role: "owner" | "cashier") {
  return `${SESSION_COOKIE}=${await sealData({ role, loginAt: "x" }, { password: getSessionSecret(), ttl: SESSION_TTL_SECONDS })}`;
}
function req(path: string, c: string, body?: unknown, method?: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { host: "localhost:3000", cookie: c, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = <T>(v: T) => ({ params: Promise.resolve(v) });

describe("ürün yönetimi API (sadece owner)", () => {
  it("kasiyer ürün listesi, detay, düzenleme, barkod ve sayım uçlarına erişemez", async () => {
    const c = await cookie("cashier");
    const id = String(p.kola.id);
    const results = await Promise.all([
      productsRoute.GET(req("/api/products", c)),
      productRoute.GET(req(`/api/products/${id}`, c), params({ id })),
      productRoute.PATCH(req(`/api/products/${id}`, c, { salePriceKurus: 1 }, "PATCH"), params({ id })),
      productBarcodesRoute.POST(req(`/api/products/${id}/barcodes`, c, { generate: true }), params({ id })),
      barcodeItemRoute.DELETE(req(`/api/products/${id}/barcodes/1`, c, undefined, "DELETE"), params({ id, barcodeId: "1" })),
      availabilityRoute.GET(req("/api/barcodes/availability?code=1", c)),
      missingRoute.POST(req("/api/barcodes/generate-missing", c, {})),
      svgRoute.GET(req("/api/barcodes/svg?code=2000000000015", c)),
      movementsRoute.GET(req(`/api/stock/movements?productId=${id}`, c)),
    ]);
    expect(results.map((r) => r.status)).toEqual(Array(results.length).fill(403));
    expect(getProductById(env.db, p.kola.id)!.salePriceKurus).toBe(5000);
  });

  it("liste pasif ürünleri ve maliyeti içerir; detay 30 günlük satış serisi döner", async () => {
    const c = await cookie("owner");
    completeSale(env.ctx, { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 3 }], paymentMethod: "card" }, { role: "owner" });
    await productRoute.PATCH(req(`/api/products/${p.cips.id}`, c, { isActive: false }, "PATCH"), params({ id: String(p.cips.id) }));
    const list = (await (await productsRoute.GET(req("/api/products", c))).json()) as { items: { id: number; avgCostKurus: number; isActive: boolean }[] };
    expect(list.items).toHaveLength(4);
    expect(list.items.find((i) => i.id === p.cips.id)).toMatchObject({ isActive: false, avgCostKurus: 4500 });

    const d = (await (await productRoute.GET(req(`/api/products/${p.kola.id}`, c), params({ id: String(p.kola.id) }))).json()) as {
      sales: { businessDate: string; qty: number }[];
      movements: { type: string }[];
    };
    expect(d.sales).toHaveLength(30);
    expect(d.sales[0]!.businessDate).toBe("2026-09-07");
    expect(d.sales.at(-1)).toEqual({ businessDate: "2026-10-06", qty: 3, revenueKurus: 15000 });
    expect(d.movements.map((m) => m.type)).toEqual(["sale", "initial"]);
  });

  it("PATCH fiyat/KDV/min stok/kategori günceller; stok ve maliyet değiştirilemez", async () => {
    const c = await cookie("owner");
    const r = await productRoute.PATCH(
      req(`/api/products/${p.kola.id}`, c, { salePriceKurus: 5500, minStock: 20, categoryName: "Gazlı İçecek", stockQty: 999, avgCostKurus: 1 }, "PATCH"),
      params({ id: String(p.kola.id) }),
    );
    expect(r.status).toBe(200);
    const k = getProductById(env.db, p.kola.id)!;
    expect(k).toMatchObject({ salePriceKurus: 5500, minStock: 20, categoryName: "Gazlı İçecek", stockQty: 48, avgCostKurus: 3200 });
  });

  it("barkod ekle (canlı kontrol), dükkân içi üret, birincil yap, sil", async () => {
    const c = await cookie("owner");
    const id = String(p.kola.id);
    const avail = await (await availabilityRoute.GET(req("/api/barcodes/availability?code=8690000000005", c))).json();
    expect(avail).toMatchObject({ available: false, productName: "Su 0,5 L" });

    const dup = await productBarcodesRoute.POST(req(`/api/products/${id}/barcodes`, c, { barcode: "8690000000005" }), params({ id }));
    expect(dup.status).toBe(409);

    const add = (await (await productBarcodesRoute.POST(req(`/api/products/${id}/barcodes`, c, { barcode: "4006381333931" }), params({ id }))).json()) as {
      product: { barcodes: { id: number; barcode: string; isPrimary: boolean }[] };
    };
    expect(add.product.barcodes.map((b) => b.barcode)).toContain("4006381333931");
    const gen = (await (await productBarcodesRoute.POST(req(`/api/products/${id}/barcodes`, c, { generate: true }), params({ id }))).json()) as typeof add;
    expect(gen.product.barcodes).toHaveLength(3);

    const target = gen.product.barcodes.find((b) => b.barcode === "4006381333931")!;
    const prim = (await (
      await barcodeItemRoute.PATCH(req(`/api/products/${id}/barcodes/${target.id}`, c, { isPrimary: true }, "PATCH"), params({ id, barcodeId: String(target.id) }))
    ).json()) as typeof add;
    expect(prim.product.barcodes.filter((b) => b.isPrimary).map((b) => b.barcode)).toEqual(["4006381333931"]);

    const del = (await (
      await barcodeItemRoute.DELETE(req(`/api/products/${id}/barcodes/${target.id}`, c, undefined, "DELETE"), params({ id, barcodeId: String(target.id) }))
    ).json()) as typeof add;
    expect(del.product.barcodes).toHaveLength(2);
    expect(del.product.barcodes.filter((b) => b.isPrimary)).toHaveLength(1);

    // başka ürünün barkodu bu üründen silinemez
    const other = p.su.barcodes[0]!.id;
    const bad = await barcodeItemRoute.DELETE(req(`/api/products/${id}/barcodes/${other}`, c, undefined, "DELETE"), params({ id, barcodeId: String(other) }));
    expect(bad.status).toBe(404);
  });

  it("barkod görseli SVG olarak döner (EAN-13 ve Code128)", async () => {
    const c = await cookie("owner");
    const r = (await (await svgRoute.GET(req("/api/barcodes/svg?code=2000000000015&code=ABC-123", c))).json()) as { svgs: Record<string, string> };
    expect(r.svgs["2000000000015"]).toMatch(/^<svg/);
    expect(r.svgs["ABC-123"]).toMatch(/^<svg/);
  });
});

describe("stok sayımı listesi (tek transaction)", () => {
  it("birden çok ürünü birlikte düzeltir", async () => {
    const c = await cookie("owner");
    const r = await adjustRoute.POST(
      req("/api/stock/adjust", c, {
        items: [
          { productId: p.kola.id, countedQty: 45, note: "Sayım farkı" },
          { productId: p.cips.id, countedQty: 30, note: "Sayım" },
          { productId: p.su.id, countedQty: 121, note: "Sayım farkı" },
        ],
      }),
    );
    expect(r.status).toBe(200);
    const b = (await r.json()) as { results: { productId: number; difference: number; changed: boolean }[] };
    expect(b.results.map((x) => [x.difference, x.changed])).toEqual([[-3, true], [0, false], [1, true]]);
    expectIntegrity(env);
  });

  it("bir satır hatalıysa hiçbiri yazılmaz", async () => {
    const c = await cookie("owner");
    const r = await adjustRoute.POST(
      req("/api/stock/adjust", c, {
        items: [
          { productId: p.kola.id, countedQty: 45, note: "Sayım" },
          { productId: 9999, countedQty: 1, note: "Sayım" },
        ],
      }),
    );
    expect(r.status).toBe(404);
    expect(getProductById(env.db, p.kola.id)!.stockQty).toBe(48);
    expectIntegrity(env);
  });
});
