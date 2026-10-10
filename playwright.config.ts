import { defineConfig, devices } from "@playwright/test";

/**
 * Uçtan uca testler: uygulamanın üretim derlemesi (next start) AYRI bir veritabanıyla çalışır
 * (data/e2e/store.db); gerçek veriye dokunulmaz. Önce `next build` gerekir: `npm run test:e2e`.
 */
const PORT = 3100;
export const E2E = {
  owner: { username: "e2e-admin", password: "e2e-sifre-12345", name: "Test Yönetici" },
  cashierPin: "8765",
  cashierNo: "1001",
  mailDir: "data/e2e/mail",
  dbPath: "data/e2e/store.db",
  barcodesCsv: "data/e2e/seed-barcodes.csv",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1, // tek veritabanı; testler sırayla
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Her çalıştırmada temiz örnek veri, sonra sunucu.
    command: `node -e "require('fs').rmSync('data/e2e',{recursive:true,force:true})" && npx tsx scripts/seed.ts && npx tsx scripts/users-cli.ts create-owner e2e-admin e2e-sifre-12345 --email=e2e-admin@test.local Test Yönetici && npx tsx scripts/users-cli.ts create-cashier "Test Kasiyer" 8765 && node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...(process.env as Record<string, string>),
      DB_PATH: E2E.dbPath,
      BACKUP_DIR: "data/e2e/backups",
      MAIL_DEV_DIR: "data/e2e/mail", // e-postalar gönderilmez, bu klasöre yazılır (testler kodu buradan okur)
      SESSION_SECRET: "e2e-only-secret-0123456789abcdef0123456789",
    },
  },
});
