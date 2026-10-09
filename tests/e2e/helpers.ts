import fs from "node:fs";
import { expect, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";

export { E2E };

/** PIN tuş takımına klavyeden PIN girer. */
export async function login(page: Page, pin: string, expectPath: RegExp = /\/(panel|kasa)/) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Giriş" })).toBeVisible();
  for (const d of pin) await page.keyboard.press(d);
  await page.keyboard.press("Enter");
  await page.waitForURL(expectPath);
}

/** Gerçek okuyucu gibi: karakter başına 5 ms, sonunda Enter (tarayıcıya gerçek tuş olayları gider). */
export async function scan(page: Page, code: string) {
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press("Enter");
}

/** Aynı barkodu bilerek tekrar okutmadan önce insan hızında bekleme (80 ms çift okuma kuralına takılmasın). */
export async function rescanPause(page: Page) {
  await page.waitForTimeout(300);
}

export async function openKasa(page: Page) {
  await page.goto("/kasa");
  await expect(page.getByText("Sepet boş. Ürün okutun.")).toBeVisible();
  await expect(page.getByTestId("barcode-input")).toBeFocused();
}

/** Sepet: [ürün adı, adet] listesi. */
export async function cart(page: Page): Promise<[string, number][]> {
  const rows = page.getByTestId("cart-row");
  const n = await rows.count();
  const out: [string, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    const name = (await r.locator("td").first().locator("div").first().innerText()).trim();
    out.push([name, Number(await r.getByTestId("qty-input").inputValue())]);
  }
  return out;
}

export interface SeedBarcode {
  no: number;
  name: string;
  barcode: string;
  type: string;
}

/** Seed'in ürettiği barkod listesi (CSV: BOM, ; ayraç). */
export function seedBarcodes(): SeedBarcode[] {
  const lines = fs.readFileSync(E2E.barcodesCsv, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1);
  return lines.map((l) => {
    const [no, name, , barcode, type] = l.split(";");
    return { no: Number(no), name: name!, barcode: barcode!, type: type! };
  });
}

export async function api<T>(page: Page, path: string): Promise<T> {
  const r = await page.request.get(path);
  expect(r.ok(), `${path} → ${r.status()}`).toBeTruthy();
  return (await r.json()) as T;
}

export async function todaySaleCount(page: Page): Promise<number> {
  return (await api<{ saleCount: number }>(page, "/api/today-stats")).saleCount;
}
