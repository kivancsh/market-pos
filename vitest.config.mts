import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    env: {
      TZ: "UTC",
      SESSION_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      OWNER_PIN: "4321",
      CASHIER_PIN: "8765",
    },
  },
});
