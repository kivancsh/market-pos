import { expect, test } from "@playwright/test";
import { loginOwner, openKasa, scan, seedBarcodes } from "./helpers";

/** Yazar kasa simülatörü: satış yazar kasayı bekler; "ödeme alındı" ile fiş kesilir, "hata" ile iptal edilip sepete geri alınır. */
test.describe("yazar kasa (simülatör)", () => {
  test.beforeEach(async ({ page }) => {
    await loginOwner(page);
    const r = await page.request.patch("/api/settings", { data: { okcMode: "simulator" } });
    expect(r.ok()).toBeTruthy();
    await openKasa(page);
  });
  test.afterEach(async ({ page }) => {
    await page.request.patch("/api/settings", { data: { okcMode: "off" } });
  });

  test("fiş kesilince satış tamamlanır; hata verirse satış iptal edilir ve ürünler sepete geri gelir", async ({ page }) => {
    const su = seedBarcodes().find((b) => b.no === 1 && b.type === "Dükkân içi")!.barcode;

    await scan(page, su);
    await expect(page.getByTestId("cart-row")).toHaveCount(1);
    await page.keyboard.press("F9");
    await page.getByTestId("complete-sale").click();
    await expect(page.getByTestId("okc-wait")).toBeVisible();
    await expect(page.getByText("Yazar kasada ödemeyi tamamlayın")).toBeVisible();
    await page.keyboard.press("Enter"); // bekleme ekranı tuşla kapanmaz…
    await page.getByTestId("okc-sim-paid").click(); // …yazar kasa ödemeyi alınca kapanır
    await expect(page.getByTestId("sale-success")).toBeVisible();
    await expect(page.getByTestId("okc-printed")).toContainText("Yazar kasa fişi kesildi");
    await page.getByTestId("new-sale").click();

    await scan(page, su);
    await expect(page.getByTestId("cart-row")).toHaveCount(1);
    await page.keyboard.press("F8");
    await page.getByTestId("complete-sale").click();
    await page.getByTestId("okc-sim-error").click();
    await expect(page.getByTestId("okc-error")).toContainText("Kâğıt bitti");
    await page.getByTestId("okc-cancel").click();
    await page.getByTestId("okc-cancel-confirm").click();
    await expect(page.getByText("Satış iptal edildi")).toBeVisible();
    await page.getByTestId("okc-restore-cart").click();
    await expect(page.getByTestId("cart-row")).toHaveCount(1);
  });
});
