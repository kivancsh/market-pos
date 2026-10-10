import { expect, test } from "@playwright/test";
import { E2E, api, latestMailCode, loginCashier, loginOwner } from "./helpers";

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

test("yönetim paneli: kasiyer ekle → Kasiyer No + PIN ile kasaya giriş", async ({ page }) => {
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
  const notice = await page.getByText(/Elif Kasa eklendi\. Kasiyer No: \d+/).innerText();
  const no = /Kasiyer No: (\d+)/.exec(notice)![1]!;
  expect(Number(no)).toBeGreaterThan(Number(E2E.cashierNo));

  await page.getByRole("button", { name: "Çıkış" }).click();
  await page.waitForURL(/\/login/);
  // doğru PIN, yanlış No → giremez
  await page.getByTestId("login-tab-cashier").click();
  await page.getByRole("button", { name: "Kasiyer No" }).click();
  await page.keyboard.press("Escape");
  for (const d of E2E.cashierNo + "5151") await page.keyboard.press(d);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Kasiyer No veya PIN hatalı/)).toBeVisible();
  await loginCashier(page, "5151", /\/kasa/, no);
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

test("kasiyerin PIN'i yönetici tarafından e-posta koduyla değiştirilir", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/yonetim/kullanicilar");
  await page.getByTestId("user-name").fill("Kaan Kasa");
  await page.getByTestId("user-pin").fill("7171");
  await page.getByTestId("user-add").click();
  const no = /Kasiyer No: (\d+)/.exec(await page.getByText(/Kaan Kasa eklendi\. Kasiyer No: \d+/).innerText())![1]!;
  const row = page.locator("li", { hasText: "Kaan Kasa" });
  await row.getByRole("button", { name: "PIN değiştir" }).click();
  const since = Date.now() - 1000;
  await page.getByTestId("secret-send-code").click();
  await expect(page.getByTestId("code-input")).toBeVisible();
  await expect(page.getByText(/e\*+@test\.local adresine gönderildi/)).toBeVisible();
  await page.getByTestId("code-input").fill(await latestMailCode(page, since));
  await page.getByTestId("secret-new").fill("8282");
  await page.getByTestId("secret-confirm").fill("8282");
  await page.getByTestId("secret-save").click();
  await expect(page.getByText("Kaan Kasa: PIN değiştirildi.", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Çıkış" }).click();
  await page.waitForURL(/\/login/);
  await loginCashier(page, "8282", /\/kasa/, no);
  await expect(page.getByTestId("nav-user")).toContainText("Kaan Kasa");
});

test("şifremi unuttum: e-postadaki kodla yönetici şifresi yenilenir", async ({ page }) => {
  // ayrı bir yönetici üzerinde (diğer testlerin şifresi değişmesin)
  await loginOwner(page);
  await page.goto("/yonetim/kullanicilar");
  await page.locator("select").first().selectOption("owner");
  await page.getByTestId("user-name").fill("Deniz Yönetici");
  await page.getByLabel("Kullanıcı adı").fill("deniz");
  await page.getByLabel("E-posta").fill("deniz@test.local");
  await page.getByLabel("Şifre (en az 8)").fill("deniz-eski-123");
  await page.getByTestId("user-add").click();
  await expect(page.getByText("Deniz Yönetici yönetici olarak eklendi.")).toBeVisible();
  await page.getByRole("button", { name: "Çıkış" }).click();
  await page.waitForURL(/\/login/);

  await page.getByTestId("login-tab-owner").click();
  await page.getByTestId("login-forgot").click();
  await page.getByTestId("forgot-username").fill("deniz");
  const since = Date.now() - 1000;
  await page.getByTestId("forgot-send").click();
  await expect(page.getByText(/d\*+@test\.local adresine gönderildi/)).toBeVisible();
  await page.getByTestId("code-input").fill(await latestMailCode(page, since));
  await page.getByTestId("forgot-new").fill("deniz-yeni-456");
  await page.getByTestId("forgot-new2").fill("deniz-yeni-456");
  await page.getByTestId("forgot-save").click();
  await expect(page.getByText("Şifreniz değiştirildi. Yeni şifrenizle giriş yapın.")).toBeVisible();
  await expect(page.getByTestId("login-username")).toHaveValue("deniz");
  await page.getByTestId("login-password").fill("deniz-yeni-456");
  await page.getByTestId("login-owner-submit").click();
  await page.waitForURL(/\/panel/);
});
