import { expect, test } from "@playwright/test";
import { E2E, login } from "./helpers";

test("kasiyer: yönetici menüleri yok, adres çubuğundan da açılamıyor, API 403", async ({ page }) => {
  await login(page, E2E.cashierPin, /\/kasa/);
  const nav = page.getByRole("navigation", { name: "Ana menü" });
  await expect(nav.getByRole("link")).toHaveText(["Kasa"]);
  for (const path of ["/panel", "/raporlar", "/urunler", "/urunler/1", "/ayarlar", "/mal-girisi", "/stok-sayim", "/etiketler", "/iade", "/simulator"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/kasa$/);
  }
  for (const path of ["/api/dashboard", "/api/products", "/api/reports/daily", "/api/sales/1"]) {
    expect((await page.request.get(path)).status(), path).toBe(403);
  }
  const catalog = await (await page.request.get("/api/catalog")).text();
  expect(catalog).not.toMatch(/cost|profit/i);
  // indirim alanı kasiyerde yok (ayar kapalı)
  await expect(page.getByTestId("discount-input")).toHaveCount(0);
});

test("oturumsuz kullanıcı girişe yönlenir", async ({ page }) => {
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/login\?next=%2Fpanel/);
});

test("yönetici: tüm menüler görünür ve panel açılır", async ({ page }) => {
  await login(page, E2E.ownerPin, /\/panel/);
  const nav = page.getByRole("navigation", { name: "Ana menü" });
  for (const label of ["Panel", "Kasa", "İade", "Ürünler", "Mal Girişi", "Stok Sayımı", "Etiketler", "Raporlar", "Ayarlar"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
});
