import { expect, test } from "@playwright/test";
import { loginOwner } from "./helpers";

/** Yapay zekâ asistanı: menüden açılır, bu ayın hedefleri görünür; ara rapor yapay zekâ olmadan da oluşur, aksiyon işaretlenir. */
test("yapay zekâ asistanı: hedefler, ara rapor, aksiyon takibi", async ({ page }) => {
  await loginOwner(page);
  await page.getByRole("link", { name: "Yapay zekâ asistanı" }).first().click();
  await expect(page.getByTestId("assistant-screen")).toBeVisible();
  await expect(page.getByTestId("assistant-targets")).toBeVisible();
  await expect(page.getByTestId("target-revenue")).toBeVisible();
  // Hesapsız kurulum: yerleşik asistan çalışır, anahtar/hesap sorulmaz
  await expect(page.getByTestId("ai-status")).toContainText("yerleşik");
  await expect(page.getByTestId("ai-settings-open")).toHaveCount(0);

  // Bu ayın ara raporu
  const month = await page.getByTestId("assistant-month").inputValue();
  const current = (await page.getByTestId("assistant-month").locator("option", { hasText: "(bu ay)" }).getAttribute("value"))!;
  if (month !== current) await page.getByTestId("assistant-month").selectOption(current);
  await page.getByTestId("assistant-generate").click();
  await expect(page.getByTestId("assistant-report")).toBeVisible();
  await expect(page.getByTestId("assistant-analysis")).toBeVisible();
  await expect(page.getByTestId("assistant-staff")).toBeVisible();
  await expect(page.getByTestId("assistant-summary")).toBeVisible();
  await expect(page.getByTestId("assistant-headline")).toContainText("ciro");
  await expect(page.getByTestId("area-fiyat")).toBeVisible();
  await expect(page.getByTestId("assistant-plan").getByRole("heading", { name: "Aylık alınabilecek aksiyonlar" })).toBeVisible();

  const first = page.getByTestId("plan-action").first();
  await expect(first).toBeVisible();
  await first.getByTestId("plan-action-done").click();
  await expect(first.getByTestId("plan-action-done")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("plan-action").first().getByTestId("plan-action-done")).toHaveAttribute("aria-pressed", "true");
});
