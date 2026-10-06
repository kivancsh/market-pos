import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { Ctx } from "@/server/context";
import { openMemoryDatabase } from "@/server/db/connection";
import { findStockMismatches } from "@/server/db/repositories/integrity";
import { createProduct, type CreateProductInput } from "@/server/services/products";

export interface TestEnv {
  ctx: Ctx;
  db: Ctx["db"];
  setNow: (iso: string) => void;
}

/** Bellek içi veritabanı + ayarlanabilir saat. Varsayılan: 6 Ekim 2026, İstanbul 12:00. */
export function createEnv(startIso = "2026-10-06T09:00:00.000Z"): TestEnv {
  const db = openMemoryDatabase();
  let now = new Date(startIso);
  return { db, ctx: { db, now: () => now }, setNow: (iso) => (now = new Date(iso)) };
}

export function expectIntegrity(env: TestEnv): void {
  expect(findStockMismatches(env.db)).toEqual([]);
  expect(env.db.pragma("foreign_key_check")).toEqual([]);
}

export const uuid = () => randomUUID();

export const SAMPLE: Record<string, CreateProductInput> = {
  su: { name: "Su 0,5 L", categoryName: "İçecek", salePriceKurus: 1000, costPriceKurus: 600, vatRate: 1, initialStock: 120, minStock: 24, barcodes: [{ barcode: "8690000000005", type: "manufacturer" }] },
  kola: { name: "Kola 1 L", categoryName: "İçecek", salePriceKurus: 5000, costPriceKurus: 3200, vatRate: 20, initialStock: 48, minStock: 12 },
  cips: { name: "Cips Büyük Boy", categoryName: "Atıştırmalık", salePriceKurus: 7000, costPriceKurus: 4500, vatRate: 10, initialStock: 30, minStock: 8 },
  cay: { name: "Çay 1 kg", categoryName: "Temel Gıda", salePriceKurus: 34000, costPriceKurus: 24000, vatRate: 1, initialStock: 3, minStock: 4 },
};

export function seedSample(env: TestEnv) {
  return {
    su: createProduct(env.ctx, SAMPLE.su!),
    kola: createProduct(env.ctx, SAMPLE.kola!),
    cips: createProduct(env.ctx, SAMPLE.cips!),
    cay: createProduct(env.ctx, SAMPLE.cay!),
  };
}

export function count(env: TestEnv, table: string): number {
  return (env.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

export function closeDay(env: TestEnv, businessDate: string): void {
  env.db
    .prepare(
      `INSERT INTO day_closings (business_date, closed_at, summary_json, expected_cash_kurus) VALUES (?, ?, '{}', 0)`,
    )
    .run(businessDate, new Date().toISOString());
}
