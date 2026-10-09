import ExcelJS from "exceljs";
import { sealData } from "iron-session";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as commitRoute from "@/app/api/import/products/commit/route";
import * as previewRoute from "@/app/api/import/products/preview/route";
import * as templateRoute from "@/app/api/import/products/template/route";
import * as exportRoute from "@/app/api/reports/[report]/export/route";
import * as reportRoute from "@/app/api/reports/[report]/route";
import * as settingsRoute from "@/app/api/settings/route";
import { getSessionSecret } from "@/server/auth/secret";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";
import { getPeriodSummary } from "@/server/db/repositories/reports";
import { getSettings } from "@/server/db/repositories/settings";
import { IMPORT_HEADERS, kurusToExcelNumber, permilleToExcelNumber } from "@/server/excel";
import { setTestCtxFactory } from "@/server/http/api";
import { cellToKurus, cellToVat, numberToKurus } from "@/server/services/productImport";
import { buildReport } from "@/server/services/reports";
import { createReturn } from "@/server/services/returns";
import { completeSale } from "@/server/services/sales";
import { voidSale } from "@/server/services/voids";
import { count, createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

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
const params = <T>(v: T) => ({ params: Promise.resolve(v) });
function get(path: string, c: string) {
  return new Request(`http://localhost:3000${path}`, { headers: { host: "localhost:3000", cookie: c } });
}
function sell(items: { productId: number; qty: number }[]) {
  return completeSale(env.ctx, { clientRequestId: uuid(), items, paymentMethod: "card" }, { role: "owner" });
}

async function xlsxFrom(rows: (string | number | null)[][], headers: readonly string[] = IMPORT_HEADERS): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ürünler");
  ws.addRow([...headers]);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as ArrayBuffer]);
}
async function upload(route: typeof previewRoute | typeof commitRoute, blob: Blob, c: string) {
  const fd = new FormData();
  fd.set("file", new File([blob], "urunler.xlsx"));
  return route.POST(new Request("http://localhost:3000/api/import/products/x", { method: "POST", headers: { host: "localhost:3000", cookie: c }, body: fd }));
}

describe("raporlar", () => {
  it("günlük özet toplamı dönem özetine eşit; satışsız günler 0; iptal dahil değil", () => {
    env.setNow("2026-10-04T09:00:00.000Z");
    sell([{ productId: p.kola.id, qty: 1 }]);
    env.setNow("2026-10-06T09:00:00.000Z");
    const a = sell([{ productId: p.su.id, qty: 3 }]);
    const v = sell([{ productId: p.cips.id, qty: 1 }]);
    voidSale(env.ctx, v.sale.id, { reason: "deneme" });
    createReturn(env.ctx, { saleId: a.sale.id, items: [{ saleItemId: a.items[0]!.id, qty: 1 }] });

    const r = buildReport(env.ctx, "daily", "2026-10-03", "2026-10-06");
    expect(r.rows.map((x) => [x.businessDate, x.saleCount, x.revenueGrossKurus])).toEqual([
      ["2026-10-03", 0, 0],
      ["2026-10-04", 1, 5000],
      ["2026-10-05", 0, 0],
      ["2026-10-06", 1, 2000],
    ]);
    const s = getPeriodSummary(env.db, "2026-10-03", "2026-10-06");
    expect(r.totals).toMatchObject({ revenueGrossKurus: s.revenueGrossKurus, grossProfitKurus: s.grossProfitKurus, saleCount: 2 });
    expect(r.rows.reduce((t, x) => t + Number(x.grossProfitKurus), 0)).toBe(s.grossProfitKurus);
  });

  it("ürün ve kategori raporlarının toplamları dönem özetiyle tutarlı", () => {
    sell([{ productId: p.kola.id, qty: 2 }, { productId: p.su.id, qty: 4 }, { productId: p.cips.id, qty: 1 }]);
    const s = getPeriodSummary(env.db, "2026-10-06", "2026-10-06");
    for (const key of ["products", "categories"]) {
      const r = buildReport(env.ctx, key, "2026-10-06", "2026-10-06");
      expect(r.totals).toMatchObject({ revenueGrossKurus: s.revenueGrossKurus, revenueNetKurus: s.revenueNetKurus, grossProfitKurus: s.grossProfitKurus });
    }
    const cats = buildReport(env.ctx, "categories", "2026-10-06", "2026-10-06").rows;
    expect(cats.map((c) => c.categoryName).sort()).toEqual(["Atıştırmalık", "İçecek"].sort());
  });

  it("düşük marj: maliyetin üstünde fiyatlansa da marjı %10 altındaki ürün listelenir", () => {
    env.db.prepare("UPDATE products SET sale_price_kurus = 3400 WHERE id = ?").run(p.kola.id); // maliyet 32,00 → marj ~%5,9
    const r = buildReport(env.ctx, "low-margin", "2026-10-06", "2026-10-06");
    expect(r.rows.map((x) => x.name)).toEqual(["Kola 1 L"]);
    expect(r.rows[0]!.unitMarginPermille).toBe(59);
  });

  it("satmayanlar (30 gün) ve stok değeri", () => {
    env.setNow("2026-09-01T09:00:00.000Z");
    sell([{ productId: p.cips.id, qty: 1 }]); // 30 günden eski
    env.setNow("2026-10-06T09:00:00.000Z");
    sell([{ productId: p.su.id, qty: 1 }]);
    const dead = buildReport(env.ctx, "dead-stock", "2026-10-06", "2026-10-06");
    expect(dead.rows.map((x) => x.name).sort()).toEqual(["Cips Büyük Boy", "Kola 1 L", "Çay 1 kg"].sort());
    expect(dead.rows.find((x) => x.name === "Cips Büyük Boy")!.lastSaleDate).toBe("2026-09-01");

    const sv = buildReport(env.ctx, "stock-value", "2026-10-06", "2026-10-06");
    // su 119×600 + kola 48×3200 + cips 29×4500 + çay 3×24000
    expect(sv.totals!.costValueKurus).toBe(119 * 600 + 48 * 3200 + 29 * 4500 + 3 * 24000);
    expect(sv.totals!.saleValueKurus).toBe(119 * 1000 + 48 * 5000 + 29 * 7000 + 3 * 34000);
  });

  it("API: tarih doğrulama, kasiyer 403, bilinmeyen rapor 404", async () => {
    const o = await cookie("owner");
    expect((await reportRoute.GET(get("/api/reports/daily?from=2026-10-06&to=2026-10-01", o), params({ report: "daily" }))).status).toBe(400);
    expect((await reportRoute.GET(get("/api/reports/daily?from=2024-01-01&to=2026-10-01", o), params({ report: "daily" }))).status).toBe(400);
    expect((await reportRoute.GET(get("/api/reports/yok", o), params({ report: "yok" }))).status).toBe(404);
    expect((await reportRoute.GET(get("/api/reports/daily", await cookie("cashier")), params({ report: "daily" }))).status).toBe(403);
    expect((await exportRoute.GET(get("/api/reports/daily/export", await cookie("cashier")), params({ report: "daily" }))).status).toBe(403);
  });

  it("Excel'e aktarım: geçerli xlsx, Türkçe başlıklar, para TL ve biçimli", async () => {
    sell([{ productId: p.kola.id, qty: 2 }]);
    const r = await exportRoute.GET(get("/api/reports/products/export?from=2026-10-06&to=2026-10-06", await cookie("owner")), params({ report: "products" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml");
    expect(r.headers.get("content-disposition")).toContain("rapor-urun-bazinda-karlilik-2026-10-06_2026-10-06.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await r.arrayBuffer()) as never);
    const ws = wb.worksheets[0]!;
    const header = (ws.getRow(5).values as unknown[]).slice(1);
    expect(header).toEqual(["Ürün", "Kategori", "Adet", "Ciro (KDV dahil)", "Ciro (KDV hariç)", "Brüt kâr (KDV hariç)", "Marj"]);
    const row = (ws.getRow(6).values as unknown[]).slice(1);
    expect(row).toEqual(["Kola 1 L", "İçecek", 2, 100, 83.33, 30, 0.36]);
    expect(ws.getColumn(4).numFmt).toContain("₺");
  });

  it("Excel sayı dönüşümleri tam (kuruş/binde metin üzerinden)", () => {
    expect(kurusToExcelNumber(123456)).toBe(1234.56);
    expect(kurusToExcelNumber(-5)).toBe(-0.05);
    expect(permilleToExcelNumber(234)).toBe(0.234);
    expect(permilleToExcelNumber(1234)).toBe(1.234);
    expect(permilleToExcelNumber(-59)).toBe(-0.059);
  });
});

describe("Excel'den ürün içe aktarma", () => {
  it("hücre dönüşümleri", () => {
    expect(numberToKurus(12.5)).toBe(1250);
    expect(numberToKurus(1234)).toBe(123400);
    expect(numberToKurus(1.234)).toBeNull();
    expect(cellToKurus("12,50")).toBe(1250);
    expect(cellToKurus("1.234,56")).toBe(123456);
    expect(cellToVat(20)).toBe(20);
    expect(cellToVat("%10")).toBe(10);
    expect(cellToVat(0.01)).toBe(1);
    expect(cellToVat(18)).toBeNaN();
    expect(cellToVat(null)).toBeNull();
  });

  it("şablon indirilir ve başlıkları doğrudur", async () => {
    const r = await templateRoute.GET(get("/api/import/products/template", await cookie("owner")));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await r.arrayBuffer()) as never);
    expect((wb.worksheets[0]!.getRow(1).values as unknown[]).slice(1)).toEqual([...IMPORT_HEADERS]);
    expect(wb.worksheets[1]!.name).toBe("Açıklama");
  });

  it("önizleme: hatalı satırlar nedenleriyle; tekrarlanan ve kayıtlı barkod reddedilir", async () => {
    const blob = await xlsxFrom([
      ["4006381333931", "Yeni Gofret", "Atıştırmalık", "8,00", "15,00", 10, 20, 5], // geçerli
      [null, "Barkodsuz Ürün", "Yeni Kategori", 3, 5.5, "%1", null, null], // geçerli, barkod üretilecek
      ["5901234123457", "Tekrar A", null, null, 10, 20, 1, 0], // dosyada tekrar
      ["5901234123457", "Tekrar B", null, null, 10, 20, 1, 0], // dosyada tekrar
      ["8690000000005", "Su Kopya", null, null, 10, 1, 0, 0], // sistemde kayıtlı (Su)
      ["4006381333932", "Hatalı Kontrol", null, null, 10, 20, 0, 0], // kontrol basamağı
      [null, "", null, null, 10, 20, 0, 0], // ad boş
      [null, "Fiyatsız", null, null, null, 20, 0, 0], // fiyat boş
      [null, "KDV Hatalı", null, null, "12,5", 18, 0, 0], // KDV
      [null, "Stok Hatalı", null, null, "12,5", 20, "beş", 0], // stok
      [null, "Kuru Çok", null, null, 12.345, 20, 0, 0], // 3 ondalık
    ]);
    const r = await upload(previewRoute, blob, await cookie("owner"));
    expect(r.status).toBe(200);
    const b = (await r.json()) as { rows: { rowNumber: number; errors: string[]; warnings: string[] }[]; validCount: number; errorCount: number };
    expect(b.validCount).toBe(2);
    expect(b.errorCount).toBe(9);
    const errs = (n: number) => b.rows.find((x) => x.rowNumber === n)!.errors.join(" | ");
    expect(errs(4)).toContain("tekrarlanıyor");
    expect(errs(5)).toContain("tekrarlanıyor");
    expect(errs(6)).toContain("Su 0,5 L");
    expect(errs(7)).toContain("kontrol basamağı");
    expect(errs(8)).toContain("Ürün adı boş");
    expect(errs(9)).toContain("Satış fiyatı boş");
    expect(errs(10)).toContain("KDV");
    expect(errs(11)).toContain("Stok");
    expect(errs(12)).toContain("Satış fiyatı hatalı");
    expect(b.rows.find((x) => x.rowNumber === 3)!.warnings.join(" ")).toMatch(/barkod üretilecek.*|Yeni kategori/);
    expect(count(env, "products")).toBe(4); // önizleme hiçbir şey yazmaz
  });

  it("onay: sadece geçerli satırlar tek seferde eklenir; barkodsuza dükkân içi barkod; başlangıç stoğu hareketle", async () => {
    const blob = await xlsxFrom([
      ["4006381333931", "Yeni Gofret", "Atıştırmalık", "8,00", "15,00", 10, 20, 5],
      [null, "Barkodsuz Ürün", "Yeni Kategori", 3, 5.5, "%1", null, null],
      [null, "", null, null, 10, 20, 0, 0],
    ]);
    const r = await upload(commitRoute, blob, await cookie("owner"));
    expect(r.status).toBe(200);
    const b = (await r.json()) as { created: { name: string; barcode: string }[]; skipped: number };
    expect(b.skipped).toBe(1);
    expect(b.created.map((c) => c.name)).toEqual(["Yeni Gofret", "Barkodsuz Ürün"]);
    expect(b.created[0]!.barcode).toBe("4006381333931");
    expect(b.created[1]!.barcode).toMatch(/^200\d{10}$/);
    const g = env.db.prepare("SELECT sale_price_kurus AS p, avg_cost_kurus AS c, vat_rate AS v, stock_qty AS s, min_stock AS m FROM products WHERE name = 'Yeni Gofret'").get();
    expect(g).toEqual({ p: 1500, c: 800, v: 10, s: 20, m: 5 });
    expectIntegrity(env);
  });

  it("şablon dışı dosya ve kasiyer reddedilir", async () => {
    const bad = await xlsxFrom([["x"]], ["A", "B"]);
    const r = await upload(previewRoute, bad, await cookie("owner"));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: { message: string } }).error.message).toContain("Başlık satırı");
    expect((await upload(previewRoute, await xlsxFrom([]), await cookie("cashier"))).status).toBe(403);
    const notXlsx = await upload(previewRoute, new Blob(["merhaba"]), await cookie("owner"));
    expect(notXlsx.status).toBe(400);
  });
});

describe("ayarlar", () => {
  it("owner günceller; hatalı değer 400; kasiyer 403", async () => {
    const o = await cookie("owner");
    const patch = (body: unknown, c = o) =>
      settingsRoute.PATCH(
        new Request("http://localhost:3000/api/settings", { method: "PATCH", headers: { host: "localhost:3000", cookie: c, "content-type": "application/json" }, body: JSON.stringify(body) }),
      );
    const ok = await patch({ businessName: "Mahalle Market", scannerMaxIntervalMs: 80, openingCashKurus: 20000, cashierCanDiscount: true });
    expect(ok.status).toBe(200);
    expect(getSettings(env.db)).toMatchObject({ businessName: "Mahalle Market", scannerMaxIntervalMs: 80, openingCashKurus: 20000, cashierCanDiscount: true });
    expect((await patch({ scannerMaxIntervalMs: 5000 })).status).toBe(400);
    expect((await patch({ bilinmeyen: 1 })).status).toBe(400);
    expect((await patch({ businessName: "X" }, await cookie("cashier"))).status).toBe(403);
  });
});
