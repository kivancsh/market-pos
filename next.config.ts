import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components bilinçli olarak KAPALI: stok ve para verisi her istekte
  // veritabanından taze okunmalı. Önbellek kullanılmıyor.
  serverExternalPackages: ["better-sqlite3", "bwip-js"],
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
