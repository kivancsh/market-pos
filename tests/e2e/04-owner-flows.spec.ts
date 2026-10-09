import { expect, test } from "@playwright/test";
import { E2E, login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, E2E.ownerPin, /\/panel/);
});

test("yeni ürün formu: barkod üret, kaydet → ürün sayfası açılır", async ({ page }) => {
  await page.goto("/urunler/yeni");
  await page.getByTestId("pf-name").fill("E2E Sakız");
  await page.getByRole("button", { name: "Dükkân içi barkod üret" }).click();
  await expect(page.getByText("birincil (etikette)")).toBeVisible();
  await page.getByTestId("pf-price").fill("12,50");
  await page.getByTestId("pf-save").click();
  await page.waitForURL(/\/urunler\/\d+\?yeni=1/);
  await expect(page.getByRole("heading", { name: "E2E Sakız" })).toBeVisible();
  await expect(page.getByTestId("barcode-list")).toContainText(/200\d{10}/);
});

test("panel telefonda yatay taşma yapmaz; raporlar ve Excel indirilebilir", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/panel");
  await expect(page.getByTestId("card-gross")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/raporlar");
  await expect(page.getByTestId("report-table")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByTestId("export-excel").click();
  expect((await download).suggestedFilename()).toMatch(/^rapor-gunluk-ozet-.*\.xlsx$/);
});

test("iade: fiş numarasıyla bul, kısmi iade al", async ({ page }) => {
  const sale = (await (
    await page.request.post("/api/sales", {
      data: { clientRequestId: "3c1f6a2b-8d4e-4f0a-9b1c-2d3e4f5a6b7c", items: [{ productId: 3, qty: 2 }], paymentMethod: "cash" },
    })
  ).json()) as { sale: { receiptNo: string } };
  await page.goto("/iade");
  await page.getByTestId("receipt-input").fill(sale.sale.receiptNo.replace("-", ""));
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sale-detail")).toBeVisible();
  await page.getByTestId("start-return").click();
  await page.getByLabel("Kola 1 L iade adedi").fill("1");
  await expect(page.getByTestId("refund-preview")).toHaveText("₺50,00");
  await page.getByTestId("confirm-return").click();
  await expect(page.getByText("İade alındı: müşteriye ₺50,00")).toBeVisible();
});

test("gün sonu: kapat → kasada uyarı ve satış reddi → yeniden aç", async ({ page, context }) => {
  await page.goto("/panel");
  await page.getByTestId("close-day").click();
  await expect(page.getByTestId("expected-cash")).toBeVisible();
  await page.getByTestId("confirm-close-day").click();
  await expect(page.getByText(/Gün kapatıldı\. Yedek alındı: store-\d{8}-\d{4}/)).toBeVisible();

  const kasa = await context.newPage();
  await kasa.goto("/kasa");
  await expect(kasa.getByText("Gün kapatıldı. Yeni satış için")).toBeVisible();
  const r = await page.request.post("/api/sales", {
    data: { clientRequestId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", items: [{ productId: 1, qty: 1 }], paymentMethod: "card" },
  });
  expect(r.status()).toBe(409);

  await page.getByRole("button", { name: "Günü yeniden aç" }).click();
  await page.getByPlaceholder("Gerekçe (zorunlu)", { exact: false }).fill("E2E testi");
  await page.getByRole("button", { name: "Yeniden aç", exact: true }).click();
  await expect(page.getByText("Gün yeniden açıldı.")).toBeVisible();
});
