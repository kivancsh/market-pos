import { expect, test } from "@playwright/test";
import { cart, loginOwner, openKasa, rescanPause, scan, seedBarcodes } from "./helpers";

test.describe("barkod okuyucu ve kasa", () => {
  test.beforeEach(async ({ page }) => {
    await loginOwner(page, /\/(panel|kasa)/);
    await openKasa(page);
  });

  test("okutulan barkod sepete gelir; tekrar okutunca adet artar; üretici barkodu aynı ürüne eşleşir", async ({ page }) => {
    const su = seedBarcodes().filter((b) => b.no === 1);
    const internal = su.find((b) => b.type === "Dükkân içi")!.barcode;
    const manufacturer = su.find((b) => b.type === "Üretici")!.barcode;

    const t0 = Date.now();
    await scan(page, internal);
    await expect(page.getByTestId("cart-row")).toHaveCount(1);
    const elapsed = Date.now() - t0;
    expect(await cart(page)).toEqual([["Su 0,5 L", 1]]);
    // istemci tarafı eşleşme: okuma (13 tuş × 5 ms) + ekrana gelme 1 saniyenin çok altında
    expect(elapsed).toBeLessThan(1000);

    await rescanPause(page);
    await scan(page, internal);
    await expect.poll(() => cart(page)).toEqual([["Su 0,5 L", 2]]);

    await rescanPause(page);
    await scan(page, manufacturer);
    await expect.poll(() => cart(page)).toEqual([["Su 0,5 L", 3]]);
  });

  test("KABUL: 27 ürünün bütün barkodları (30 barkod) doğru ürüne eşleşir", async ({ page }) => {
    const all = seedBarcodes();
    expect(new Set(all.map((b) => b.no)).size).toBe(27);
    expect(all).toHaveLength(30);
    for (const b of all) {
      await rescanPause(page);
      await scan(page, b.barcode);
      await expect(page.getByTestId("scan-message")).toContainText(`${b.name} eklendi`);
      const row = page.locator(`[data-testid=cart-row][aria-selected=true]`);
      await expect(row).toContainText(b.name);
    }
    const c = await cart(page);
    expect(c).toHaveLength(27);
    // üretici barkodu olan 3 ürün iki kez okutuldu
    expect(c.filter(([, q]) => q === 2).map(([n]) => n).sort()).toEqual(["Kola 1 L", "Su 0,5 L", "Süt 1 L"].sort());
  });

  test("hatalı kontrol basamaklı barkod: uyarı verir, sepet değişmez", async ({ page }) => {
    const su = seedBarcodes()[0]!.barcode;
    await scan(page, su);
    await expect(page.getByTestId("cart-row")).toHaveCount(1);
    const bad = su.slice(0, 12) + String((Number(su[12]) + 1) % 10);
    await scan(page, bad);
    await expect(page.getByTestId("scan-message")).toContainText("Barkod hatalı okundu, tekrar okutun");
    expect(await cart(page)).toEqual([["Su 0,5 L", 1]]);
  });

  test("bilinmeyen barkod: uyarı + yeni ürün tanımla → sepete eklenir", async ({ page }) => {
    await scan(page, "4006381333931");
    await expect(page.getByTestId("scan-message")).toContainText("Bilinmeyen barkod: 4006381333931");
    await page.getByRole("button", { name: "Bu barkodla yeni ürün tanımla" }).click();
    await page.getByTestId("qp-name").fill("E2E Kalem");
    await page.getByTestId("qp-price").fill("17,50");
    await page.getByTestId("qp-save").click();
    await expect.poll(() => cart(page)).toEqual([["E2E Kalem", 1]]);
    await expect(page.getByTestId("grand-total")).toHaveText("₺17,50");
    // artık katalogda: tekrar okutunca adet artar
    await page.getByTestId("barcode-input").focus();
    await rescanPause(page);
    await scan(page, "4006381333931");
    await expect.poll(() => cart(page)).toEqual([["E2E Kalem", 2]]);
  });

  test("odak indirim alanındayken okutma: alana yazılanlar geri alınır, ürün sepete gelir", async ({ page }) => {
    const kola = seedBarcodes().find((b) => b.no === 3)!.barcode;
    const discount = page.getByTestId("discount-input");
    await discount.click();
    await page.keyboard.type("5", { delay: 120 }); // insan hızında
    await scan(page, kola);
    await expect.poll(() => cart(page)).toEqual([["Kola 1 L", 1]]);
    await expect(discount).toHaveValue("5");
    await expect(page.getByTestId("grand-total")).toHaveText("₺45,00");
  });

  test("elle yazıp Enter'a basınca da çalışır; adıyla aranabilir", async ({ page }) => {
    const ayran = seedBarcodes().find((b) => b.no === 4)!.barcode;
    await page.getByTestId("barcode-input").pressSequentially(ayran, { delay: 120 });
    await page.keyboard.press("Enter");
    await expect.poll(() => cart(page)).toEqual([["Ayran 300 ml", 1]]);
    await page.getByTestId("barcode-input").pressSequentially("bisk", { delay: 80 });
    await expect(page.getByRole("option").first()).toContainText("Bisküvi");
    await page.keyboard.press("Enter");
    await expect.poll(() => cart(page)).toEqual([
      ["Ayran 300 ml", 1],
      ["Bisküvi", 1],
    ]);
  });
});

test.describe("okuyucu çift tetikleme", () => {
  test("aynı barkod 80 ms içinde iki kez gelirse tek sayılır (okuyucu hatası)", async ({ page }) => {
    await loginOwner(page, /\/(panel|kasa)/);
    await openKasa(page);
    const su = seedBarcodes()[0]!.barcode;
    await scan(page, su);
    await scan(page, su); // arada bekleme yok
    await expect(page.getByTestId("scan-message")).toContainText("tek sayıldı");
    expect(await cart(page)).toEqual([["Su 0,5 L", 1]]);
  });
});
