import { expect, test } from "@playwright/test";
import { loginCashier, loginOwner } from "./helpers";

test("kasiyer: yönetici menüleri yok, adres çubuğundan da açılamıyor, API 403", async ({ page }) => {
  await loginCashier(page);
  const nav = page.getByRole("navigation", { name: "Ana menü" });
  await expect(nav.getByRole("link")).toHaveText(["Kasa"]);
  for (const path of ["/panel", "/raporlar", "/urunler", "/urunler/1", "/ayarlar", "/mal-girisi", "/stok-sayim", "/etiketler", "/iade", "/simulator", "/yonetim", "/yonetim/kullanicilar", "/yonetim/toplu-fiyat"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/kasa$/);
  }
  for (const path of ["/api/dashboard", "/api/products", "/api/reports/daily", "/api/sales/1", "/api/users", "/api/audit"]) {
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

test("yönetici: Yönetici Paneli açılır; yan menüden kasiyer performansı ve gün sonu", async ({ page }) => {
  await loginOwner(page);
  const nav = page.getByRole("navigation", { name: "Ana menü" });
  for (const label of ["Yönetici Paneli", "Kasa"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Yönetici Paneli" })).toBeVisible();
  await expect(page.getByTestId("kpi-revenue")).toBeVisible();
  const side = page.getByRole("navigation", { name: "Yönetici menüsü" });
  for (const label of ["Genel bakış", "Bugün ve gün sonu", "Kasiyer performansı", "Ürünler ve fiyatlar", "Mal girişi", "Raporlar ve Excel", "Kullanıcılar", "Ayarlar ve yedekler"]) {
    await expect(side.getByRole("link", { name: label })).toBeVisible();
  }
  await side.getByRole("link", { name: "Kasiyer performansı" }).click();
  await expect(page.getByRole("heading", { name: "Kasiyer performansı" })).toBeVisible();
  await expect(side.getByRole("link", { name: "Kasiyer performansı" })).toHaveAttribute("aria-current", "page");
  await side.getByRole("link", { name: "Bugün ve gün sonu" }).click();
  await expect(page).toHaveURL(/\/panel/);
  await expect(page.getByTestId("summary-cards")).toBeVisible();
  // Dönem seçimi
  await page.goto("/yonetim?donem=ay");
  await expect(page.getByRole("link", { name: "Bu ay" })).toHaveAttribute("aria-current", "page");
});
