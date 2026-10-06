import { describe, expect, it } from "vitest";
import {
  addDays,
  endOfMonth,
  getBusinessDate,
  getIstanbulHour,
  isBusinessDate,
  presetRange,
  startOfWeek,
} from "@/lib/businessDate";

describe("getBusinessDate (Europe/Istanbul)", () => {
  it("İstanbul 23:59 aynı gün, 00:01 ertesi gün", () => {
    // İstanbul = UTC+3
    expect(getBusinessDate(new Date("2026-10-06T20:59:00Z"))).toBe("2026-10-06"); // 23:59
    expect(getBusinessDate(new Date("2026-10-06T21:01:00Z"))).toBe("2026-10-07"); // 00:01
    expect(getBusinessDate(new Date("2026-10-06T21:00:00Z"))).toBe("2026-10-07"); // 00:00
  });

  it("UTC gece yarısından önce İstanbul'da gün çoktan değişmiştir", () => {
    expect(getBusinessDate(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
  });

  it("İstanbul saati", () => {
    expect(getIstanbulHour(new Date("2026-10-06T20:59:00Z"))).toBe(23);
    expect(getIstanbulHour(new Date("2026-10-06T21:01:00Z"))).toBe(0);
    expect(getIstanbulHour(new Date("2026-10-06T06:00:00Z"))).toBe(9);
  });
});

describe("tarih aralıkları", () => {
  it("gün ekleme / ay sonu / geçerlilik", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(isBusinessDate("2026-02-30")).toBe(false);
    expect(isBusinessDate("2026-10-06")).toBe(true);
  });

  it("hafta Pazartesi başlar", () => {
    expect(startOfWeek("2026-10-06")).toBe("2026-10-05"); // Salı → Pazartesi
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05"); // Pazar → önceki Pazartesi
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05");
  });

  it("hazır aralıklar", () => {
    expect(presetRange("today", "2026-10-06")).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(presetRange("yesterday", "2026-10-06")).toEqual({ from: "2026-10-05", to: "2026-10-05" });
    expect(presetRange("this_week", "2026-10-06")).toEqual({ from: "2026-10-05", to: "2026-10-06" });
    expect(presetRange("this_month", "2026-10-06")).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(presetRange("last_month", "2026-10-06")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});
