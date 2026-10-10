import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components bilinçli olarak KAPALI: stok ve para verisi her istekte
  // veritabanından taze okunmalı. Önbellek kullanılmıyor.
  serverExternalPackages: ["better-sqlite3", "bwip-js", "exceljs", "nodemailer"],
  // Windows kurulum paketi için (windows/build.mjs): kendi kendine yeten sunucu çıktısı.
  // Normal kullanımda ikisi de boş kalır; Mac'teki "next start" akışı değişmez.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
