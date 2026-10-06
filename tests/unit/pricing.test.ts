import { describe, expect, it } from "vitest";
import {
  computeLine,
  distributeDiscount,
  incrementalShare,
  netOfVat,
  resolveCartDiscount,
  weightedAverageCost,
} from "@/lib/pricing";

describe("KDV ayrıştırma ve kâr (3 farklı KDV oranı)", () => {
  it("%20 KDV", () => {
    expect(
      computeLine({ unitPriceKurus: 5000, unitCostKurus: 3200, qty: 2, vatRate: 20, lineDiscountKurus: 0 }),
    ).toEqual({
      lineGrossKurus: 10000,
      lineDiscountKurus: 0,
      lineTotalKurus: 10000,
      lineNetKurus: 8333,
      lineVatKurus: 1667,
      lineCostKurus: 6400,
      lineCostNetKurus: 5333,
      lineProfitKurus: 3000,
    });
  });

  it("%10 KDV", () => {
    const l = computeLine({ unitPriceKurus: 7000, unitCostKurus: 4500, qty: 1, vatRate: 10, lineDiscountKurus: 0 });
    expect([l.lineNetKurus, l.lineVatKurus, l.lineCostNetKurus, l.lineProfitKurus]).toEqual([6364, 636, 4091, 2273]);
  });

  it("%1 KDV", () => {
    const l = computeLine({ unitPriceKurus: 1000, unitCostKurus: 600, qty: 3, vatRate: 1, lineDiscountKurus: 0 });
    expect([l.lineTotalKurus, l.lineNetKurus, l.lineVatKurus, l.lineCostKurus, l.lineCostNetKurus, l.lineProfitKurus]).toEqual([
      3000, 2970, 30, 1800, 1782, 1188,
    ]);
  });

  it("satır indirimi KDV dahil tutardan düşer", () => {
    const l = computeLine({ unitPriceKurus: 5000, unitCostKurus: 3200, qty: 2, vatRate: 20, lineDiscountKurus: 1000 });
    expect([l.lineTotalKurus, l.lineNetKurus, l.lineVatKurus, l.lineProfitKurus]).toEqual([9000, 7500, 1500, 2167]);
  });

  it("net + KDV her zaman KDV dahil tutara eşittir", () => {
    for (const vat of [1, 10, 20]) {
      for (let total = 0; total < 3000; total += 7) {
        const net = netOfVat(total, vat);
        expect(net + (total - net)).toBe(total);
        expect(net).toBeLessThanOrEqual(total);
      }
    }
  });

  it("indirim satır tutarını aşamaz", () => {
    expect(() =>
      computeLine({ unitPriceKurus: 100, unitCostKurus: 0, qty: 1, vatRate: 20, lineDiscountKurus: 101 }),
    ).toThrow();
  });
});

describe("sepet indirimi", () => {
  it("TL ve yüzde indirimi kuruşa çevirir", () => {
    expect(resolveCartDiscount(10000, { type: "amount", value: 1000 })).toBe(1000);
    expect(resolveCartDiscount(6001, { type: "percent", value: 7 })).toBe(420); // 420,07 → 420
    expect(resolveCartDiscount(10000, null)).toBe(0);
    expect(() => resolveCartDiscount(500, { type: "amount", value: 501 })).toThrow();
    expect(() => resolveCartDiscount(500, { type: "percent", value: 101 })).toThrow();
  });

  it("3 kalemde 10,00 TL indirim kuruşu kuruşuna dağıtılır", () => {
    const shares = distributeDiscount([3333, 3333, 3334], 1000);
    expect(shares).toEqual([333, 333, 334]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("3 kalemde %7 indirim kuruşu kuruşuna dağıtılır (en büyük kalan)", () => {
    const grosses = [1999, 2501, 1500];
    const discount = resolveCartDiscount(6000, { type: "percent", value: 7 });
    expect(discount).toBe(420);
    const shares = distributeDiscount(grosses, discount);
    expect(shares).toEqual([140, 175, 105]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(420);
  });

  it("rastgele sepetlerde toplam her zaman tutar, hiçbir satır eksiye düşmez", () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let t = 0; t < 2000; t++) {
      const grosses = Array.from({ length: 1 + rand(6) }, () => rand(50000));
      const total = grosses.reduce((a, b) => a + b, 0);
      const discount = total === 0 ? 0 : rand(total + 1);
      const shares = distributeDiscount(grosses, discount);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(discount);
      shares.forEach((s, i) => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(grosses[i]!);
      });
    }
  });

  it("indirimin tamamı (%100) satırları tam sıfırlar", () => {
    expect(distributeDiscount([100, 250], 350)).toEqual([100, 250]);
  });
});

describe("ağırlıklı ortalama maliyet", () => {
  it("normal durum", () => {
    expect(weightedAverageCost(10, 1000, 5, 1300)).toBe(1100);
  });
  it("yuvarlama tam sayı ile yapılır", () => {
    expect(weightedAverageCost(3, 1000, 4, 1001)).toBe(1001); // 7004/7 = 1000,57
    expect(weightedAverageCost(3, 1000, 4, 1000)).toBe(1000);
  });
  it("stok 0 ise yeni maliyet doğrudan alınır", () => {
    expect(weightedAverageCost(0, 999, 5, 1300)).toBe(1300);
  });
  it("stok negatifse 0 sayılır, yeni maliyet doğrudan alınır", () => {
    expect(weightedAverageCost(-4, 999, 5, 1300)).toBe(1300);
  });
});

describe("kısmi iade birikimli payı", () => {
  it("parça parça iadelerin toplamı tam iadeye eşittir", () => {
    const lineTotal = 1001; // 3 adet, adet başı 333,67
    const a = incrementalShare(lineTotal, 3, 0, 1);
    const b = incrementalShare(lineTotal, 3, 1, 1);
    const c = incrementalShare(lineTotal, 3, 2, 1);
    expect(a + b + c).toBe(lineTotal);
    expect(incrementalShare(lineTotal, 3, 0, 3)).toBe(lineTotal);
  });
});
