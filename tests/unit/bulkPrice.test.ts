import { describe, expect, it } from "vitest";
import { applyBulkChange } from "@/lib/bulkPrice";

describe("toplu fiyat hesabı (tam sayı kuruş)", () => {
  it("yüzde artış / indirim (ondalıklı yüzde: 7,5% = 750)", () => {
    expect(applyBulkChange(1000, { mode: "percent", direction: "increase", value: 1000, rounding: "none" })).toBe(1100);
    expect(applyBulkChange(1000, { mode: "percent", direction: "increase", value: 750, rounding: "none" })).toBe(1075);
    expect(applyBulkChange(999, { mode: "percent", direction: "increase", value: 1000, rounding: "none" })).toBe(1099); // 99,9 → 100 kuruş yuvarlanır
    expect(applyBulkChange(5000, { mode: "percent", direction: "decrease", value: 2000, rounding: "none" })).toBe(4000);
  });
  it("TL ile artış / indirim; sıfıra düşen fiyat geçersiz", () => {
    expect(applyBulkChange(5000, { mode: "amount", direction: "increase", value: 250, rounding: "none" })).toBe(5250);
    expect(applyBulkChange(500, { mode: "amount", direction: "decrease", value: 500, rounding: "none" })).toBeNull();
  });
  it("yuvarlama: 0,50 / 1,00 / x,90", () => {
    const c = (rounding: "r50" | "r100" | "end90") => ({ mode: "percent" as const, direction: "increase" as const, value: 1000, rounding });
    expect(applyBulkChange(4545, c("r50"))).toBe(5000); // 49,995 → 50,00
    expect(applyBulkChange(1230, c("r50"))).toBe(1350); // 13,53 → 13,50
    expect(applyBulkChange(1230, c("r100"))).toBe(1400); // 13,53 → 14,00
    expect(applyBulkChange(1230, c("end90"))).toBe(1390); // 13,53 → 13,90
    expect(applyBulkChange(1000, c("end90"))).toBe(1090); // 11,00 → 10,90
  });
});
