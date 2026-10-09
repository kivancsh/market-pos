import { expect, test } from "@playwright/test";
import { E2E, api, cart, login, openKasa, rescanPause, scan, seedBarcodes, todaySaleCount } from "./helpers";

interface Dash {
  summary: { revenueGrossKurus: number; grossProfitKurus: number; saleCount: number };
}
interface Products {
  items: { id: number; name: string; stockQty: number }[];
}

test("nakit satış: para üstü doğru; panel ciro/kâr ve stok güncel (sayfa yenilemeden)", async ({ page, context }) => {
  await login(page, E2E.ownerPin);
  const before = await api<Dash>(page, "/api/dashboard");
  const kolaStock = (await api<Products>(page, "/api/products")).items.find((p) => p.name === "Kola 1 L")!.stockQty;

  // Panel ikinci sekmede açık kalsın
  const panel = await context.newPage();
  await panel.goto("/panel");
  const grossCard = panel.getByTestId("card-gross");
  await expect(grossCard).toBeVisible();
  const grossBefore = await grossCard.locator("div").nth(1).innerText();

  await openKasa(page);
  const kola = seedBarcodes().find((b) => b.no === 3 && b.type === "Dükkân içi")!.barcode;
  await scan(page, kola);
  await rescanPause(page);
  await scan(page, kola);
  await expect.poll(() => cart(page)).toEqual([["Kola 1 L", 2]]);
  await expect(page.getByTestId("grand-total")).toHaveText("₺100,00");

  await page.keyboard.press("F8");
  await page.getByTestId("cash-received").fill("200");
  await expect(page.getByTestId("change-preview")).toHaveText("₺100,00");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sale-success")).toBeVisible();
  await expect(page.getByTestId("change-amount")).toHaveText("₺100,00");
  await expect(page.getByTestId("receipt-no")).toHaveText(/^\d{8}-\d{4}$/);

  const after = await api<Dash>(page, "/api/dashboard");
  expect(after.summary.revenueGrossKurus - before.summary.revenueGrossKurus).toBe(10000);
  expect(after.summary.grossProfitKurus - before.summary.grossProfitKurus).toBe(3000); // 2 × (41,67 − 26,67)
  expect(after.summary.saleCount - before.summary.saleCount).toBe(1);
  const kolaAfter = (await api<Products>(page, "/api/products")).items.find((p) => p.name === "Kola 1 L")!.stockQty;
  expect(kolaAfter).toBe(kolaStock - 2);

  // KABUL: panel birkaç saniye içinde kendiliğinden güncellenir
  await expect.poll(() => grossCard.locator("div").nth(1).innerText(), { timeout: 8_000 }).not.toBe(grossBefore);
});

test("'Satışı tamamla'ya hızlı çift tıklama → tek satış", async ({ page }) => {
  await login(page, E2E.ownerPin);
  await openKasa(page);
  const before = await todaySaleCount(page);
  await scan(page, seedBarcodes()[0]!.barcode);
  await expect(page.getByTestId("cart-row")).toHaveCount(1);
  await page.keyboard.press("F9");
  await page.getByTestId("complete-sale").dblclick();
  await expect(page.getByTestId("sale-success")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await todaySaleCount(page)).toBe(before + 1);
});

test("aynı sepet iki kez gönderilse de (ağ tekrarı) tek satış", async ({ page }) => {
  await login(page, E2E.ownerPin);
  const before = await todaySaleCount(page);
  const body = { clientRequestId: "7b0e2f3c-0d1a-4c55-9e7e-1f2a3b4c5d6e", items: [{ productId: 1, qty: 1 }], paymentMethod: "card" };
  const [a, b] = await Promise.all([page.request.post("/api/sales", { data: body }), page.request.post("/api/sales", { data: body })]);
  expect(a.ok() && b.ok()).toBeTruthy();
  const ra = (await a.json()) as { sale: { id: number } };
  const rb = (await b.json()) as { sale: { id: number } };
  expect(ra.sale.id).toBe(rb.sale.id);
  expect(await todaySaleCount(page)).toBe(before + 1);
});
