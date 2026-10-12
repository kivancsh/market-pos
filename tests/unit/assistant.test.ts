import { describe, expect, it } from "vitest";
import { isMonth, monthLabel, shiftMonth, targetProgress, withStaffNames } from "@/lib/assistant";
import { presentForAi } from "@/server/services/assistant/ai";
import { withSuffix } from "@/lib/turkish";
import { roundUpPrice } from "@/server/services/assistant/facts";

describe("ay yardımcıları", () => {
  it("ay kaydırma, ad, doğrulama", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", -12)).toBe("2025-10");
    expect(monthLabel("2026-09")).toBe("Eylül 2026");
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-10")).toBe(true);
  });
});

describe("hedef gidişatı", () => {
  it("birikimli hedef: bugüne kadar beklenen, ay sonu tahmini, ±%3 yolunda", () => {
    // Ayın %40'ı geçti (hafta günü ağırlıklı); hedef 100.000; gerçekleşen 41.000 → beklenen 40.000 → yolunda
    const p = targetProgress("revenue", 100_000, 90_000, 41_000, 400, true);
    expect(p).toMatchObject({ expectedToDate: 40_000, forecast: 102_500, achievementPermille: 410, status: "on_track" });
    expect(targetProgress("revenue", 100_000, 90_000, 30_000, 400, true).status).toBe("behind");
    expect(targetProgress("revenue", 100_000, 90_000, 50_000, 400, true).status).toBe("ahead");
    expect(targetProgress("revenue", 100_000, 90_000, 0, 0, false).status).toBe("no_data");
  });
  it("gider bütçesi: aşılırsa geride; oran hedefleri doğrudan karşılaştırılır", () => {
    expect(targetProgress("expenses", 100_000, 100_000, 120_000, 500, true).status).toBe("behind");
    expect(targetProgress("expenses", 100_000, 100_000, 50_000, 500, true).status).toBe("ahead");
    expect(targetProgress("margin", 250, 240, 248, 500, true).status).toBe("on_track");
    expect(targetProgress("margin", 250, 240, 230, 500, true).status).toBe("behind");
  });
});

describe("takma ad ve biçim", () => {
  it("takma adları adla gösterir; benzer numaraları karıştırmaz", () => {
    const names = { "Kasiyer 1001": "Mehmet", "Kasiyer 10012": "Ali", Yönetici: "Ayşe" };
    expect(withStaffNames("Kasiyer 1001 ve Kasiyer 10012, Yönetici ile", names)).toBe("Mehmet (Kasiyer 1001) ve Ali (Kasiyer 10012), Ayşe (Yönetici) ile");
  });
  it("yapay zekâya giden veride para ve oranlar okunur metindir; kimlik ve işletme adı gitmez", () => {
    expect(presentForAi({ id: 3, businessName: "Dükkân", priceKurus: 6050, marginPermille: -25, avgTenths: 15, liftHundredths: 215, list: [{ costKurus: 100 }] })).toEqual({
      priceTL: "₺60,50",
      marginYuzde: "-%2,5",
      avg: "1,5",
      liftKat: "2,15",
      list: [{ costTL: "₺1,00" }],
    });
  });
  it("önerilen fiyat 50 kuruşa yukarı yuvarlanır", () => {
    expect(roundUpPrice(6020)).toBe(6050);
    expect(roundUpPrice(6000)).toBe(6000);
    expect(roundUpPrice(6001)).toBe(6050);
  });
});

describe("Türkçe sayı ekleri", () => {
  it("ek, sayının okunuşunun son kelimesine uyar", () => {
    expect(withSuffix("%55,6", "poss")).toBe("%55,6'sı");
    expect(withSuffix("%30,0", "poss")).toBe("%30,0'ı");
    expect(withSuffix("%12,3", "poss")).toBe("%12,3'ü");
    expect(withSuffix("%44,5", "poss")).toBe("%44,5'i");
    expect(withSuffix("%80,9", "acc")).toBe("%80,9'unu");
    expect(withSuffix("%70,2", "acc")).toBe("%70,2'sini");
    expect(withSuffix("5", "loc")).toBe("5'inde");
    expect(withSuffix("4", "loc")).toBe("4'ünde");
    expect(withSuffix("6", "loc")).toBe("6'sında");
    expect(withSuffix("40", "poss")).toBe("40'ı");
    expect(withSuffix("20", "loc")).toBe("20'sinde");
    expect(withSuffix("100", "poss")).toBe("100'ü");
  });
});
