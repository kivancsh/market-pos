import { expect, test } from "@playwright/test";
import { api, loginCashier, loginOwner } from "./helpers";

interface P {
  id: number;
  name: string;
  salePriceKurus: number;
  isActive: boolean;
  categoryId: number | null;
}

test("kurulum yapılmışsa /kurulum girişe yönlenir; hatalı şifre reddedilir", async ({ page }) => {
  await page.goto("/kurulum");
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId("login-tab-owner").click();
  await page.getByTestId("login-username").fill("e2e-admin");
  await page.getByTestId("login-password").fill("yanlis-sifre-000");
  await page.getByTestId("login-owner-submit").click();
  await expect(page.getByText(/Kullanıcı adı veya şifre hatalı/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("yönetim paneli: kasiyer ekle → o PIN ile kasaya giriş", async ({ page }) => {
  await loginOwner(page);
  await page.getByRole("navigation", { name: "Ana menü" }).getByRole("link", { name: "Yönetim Paneli" }).click();
  await expect(page).toHaveURL(/\/yonetim$/);
  for (const href of ["/urunler", "/yonetim/toplu-fiyat", "/yonetim/kategoriler", "/yonetim/islem-gecmisi", "/yonetim/kullanicilar", "/yonetim/hesabim"]) {
    await expect(page.getByTestId(`tile-${href}`)).toBeVisible();
  }
  await page.getByTestId("tile-/yonetim/kullanicilar").click();
  await page.getByTestId("user-name").fill("Elif Kasa");
  await page.getByTestId("user-pin").fill("5151");
  await page.getByTestId("user-add").click();
  await expect(page.getByTestId("user-list")).toContainText("Elif Kasa");

  await page.getByRole("button", { name: "Çıkış" }).click();
  await page.waitForURL(/\/login/);
  await loginCashier(page, "5151");
  await expect(page.getByTestId("nav-user")).toContainText("Elif Kasa");
});

test("ürün listesinde fiyatı yerinde değiştir → işlem geçmişinde görünür", async ({ page }) => {
  await loginOwner(page);
  const { items } = await api<{ items: P[] }>(page, "/api/products");
  const p = items.find((x) => x.isActive)!;
  await page.goto("/urunler");
  await page.getByTestId(`price-edit-${p.id}`).click();
  const input = page.getByTestId(`price-input-${p.id}`);
  await input.fill("99,90");
  await input.press("Enter");
  await expect(page.getByTestId(`price-edit-${p.id}`)).toHaveText("₺99,90");
  const after = await api<{ items: P[] }>(page, "/api/products");
  expect(after.items.find((x) => x.id === p.id)!.salePriceKurus).toBe(9990);

  await page.goto("/yonetim/islem-gecmisi");
  await expect(page.getByTestId("audit-table")).toContainText(`${p.name}: `);
  await expect(page.getByTestId("audit-table")).toContainText("₺99,90");
  await page.getByTestId("audit-action").selectOption("auth.");
  await expect(page.getByTestId("audit-table")).toContainText("Giriş");
  await expect(page.getByTestId("audit-table")).not.toContainText("₺99,90");
});

test("toplu fiyat: kategoriye %10 zam, önizle → uygula", async ({ page }) => {
  await loginOwner(page);
  const { items } = await api<{ items: P[] }>(page, "/api/products");
  const target = items.find((x) => x.isActive && x.categoryId !== null)!;
  const inCat = items.filter((x) => x.isActive && x.categoryId === target.categoryId);
  await page.goto("/yonetim/toplu-fiyat");
  await page.getByTestId("bulk-category").selectOption(String(target.categoryId));
  await page.getByTestId("bulk-value").fill("10");
  await page.getByTestId("bulk-preview").click();
  await expect(page.getByTestId("bulk-table").locator("tbody tr")).toHaveCount(inCat.length);
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("bulk-apply").click();
  await expect(page.getByText(/ürünün fiyatı güncellendi/)).toBeVisible();
  const after = await api<{ items: P[] }>(page, "/api/products");
  const np = after.items.find((x) => x.id === target.id)!.salePriceKurus;
  expect(np).toBe(Math.floor((target.salePriceKurus * 110 + 50) / 100));
});

test("kategoriler: ekle, listede ürün sayısıyla görünür", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/yonetim/kategoriler");
  await page.getByTestId("cat-name").fill("E2E Kategori");
  await page.getByTestId("cat-add").click();
  await expect(page.getByTestId("cat-list")).toContainText("E2E Kategori");
});
