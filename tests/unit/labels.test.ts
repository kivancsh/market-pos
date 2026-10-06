import { describe, expect, it } from "vitest";
import { labelLayout, paginateLabels } from "@/lib/labels";
import { unitEconomics } from "@/lib/pricing";

describe("etiket yerleşimi", () => {
  it("3×8 kenar boşluksuz: 70 × 37,1 mm, sayfa başına 24", () => {
    expect(labelLayout(3, 8, 0)).toEqual({ cols: 3, rows: 8, marginMm: 0, cellWidthMm: 70, cellHeightMm: 37.1, perPage: 24 });
  });
  it("kenar boşluğu hücreleri küçültür; saçma değerler sınırlanır", () => {
    expect(labelLayout(3, 8, 5).cellWidthMm).toBe(66.7);
    expect(labelLayout(0, 99, -3)).toMatchObject({ cols: 1, rows: 20, marginMm: 0 });
  });
  it("sayfalara böler, ilk sayfada atlanan hücreler boş kalır", () => {
    const pages = paginateLabels(["a", "b", "c", "d", "e"], 4, 2);
    expect(pages).toEqual([
      [null, null, "a", "b"],
      ["c", "d", "e", null],
    ]);
    expect(paginateLabels([], 24)).toEqual([]);
  });
});

describe("birim kâr", () => {
  it("KDV hariç satış − KDV hariç maliyet", () => {
    // Kola: 50,00 / 32,00 (%20) → 41,67 − 26,67 = 15,00
    expect(unitEconomics(5000, 3200, 20)).toEqual({ netPriceKurus: 4167, netCostKurus: 2667, profitKurus: 1500 });
  });
});
