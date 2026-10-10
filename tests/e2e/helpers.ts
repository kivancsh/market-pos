import fs from "node:fs";
import { expect, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";

export { E2E };

/** Kasiyer girişi: PIN tuş takımına klavyeden PIN girer. */
/** Kasiyer girişi: Kasiyer No + PIN (tuş takımına klavyeden). */
export async function loginCashier(page: Page, pin: string = E2E.cashierPin, expectPath: RegExp = /\/kasa/, cashierNo: string = E2E.cashierNo) {
  await page.goto("/login");
  await page.getByTestId("login-tab-cashier").click();
  await expect(page.getByRole("button", { name: "Giriş", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kasiyer No" }).click();
  await page.keyboard.press("Escape"); // önceki girişten hatırlanan No'yu temizle
  for (const d of cashierNo) await page.keyboard.press(d);
  await page.keyboard.press("Enter"); // PIN alanına geç
  for (const d of pin) await page.keyboard.press(d);
  await page.keyboard.press("Enter");
  await page.waitForURL(expectPath);
}

/** Test sunucusunun e-posta klasöründeki (MAIL_DEV_DIR) son e-postadan onay kodu. */
export async function latestMailCode(page: Page, sinceMs: number): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(
      () => {
        if (!fs.existsSync(E2E.mailDir)) return null;
        const files = fs
          .readdirSync(E2E.mailDir)
          .filter((f) => f.endsWith(".json") && Number(f.split("-")[0]) >= sinceMs)
          .sort();
        const last = files.at(-1);
        if (!last) return null;
        const m = /(\d{6})/.exec(JSON.parse(fs.readFileSync(`${E2E.mailDir}/${last}`, "utf8")).subject);
        code = m ? m[1]! : null;
        return code;
      },
      { timeout: 8000 },
    )
    .not.toBeNull();
  void page;
  return code!;
}

/** Yönetici girişi: "Yönetici" sekmesinde kullanıcı adı + şifre. */
export async function loginOwner(page: Page, expectPath: RegExp = /\/yonetim/) {
  await page.goto("/login");
  await page.getByTestId("login-tab-owner").click();
  await page.getByTestId("login-username").fill(E2E.owner.username);
  await page.getByTestId("login-password").fill(E2E.owner.password);
  await page.getByTestId("login-owner-submit").click();
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
