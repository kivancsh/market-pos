import { describe, expect, it } from "vitest";
import { divRound, formatKurusPlain, formatMargin, formatTRY, mulDivRound, parseTRYToKurus } from "@/lib/money";

describe("parseTRYToKurus", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12,50", 1250],
    ["12.50", 1250],
    ["12.5", 1250],
    ["0,05", 5],
    [",5", 50],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["1.234.567,89", 123456789],
    ["₺12,50", 1250],
    ["12,50 TL", 1250],
    ["  7 ", 700],
    ["0", 0],
  ])("%s → %i kuruş", (input, expected) => {
    expect(parseTRYToKurus(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "12,345", "1,2,3", "12.3.4", "1.23,4", "12a", "--5", "1.2345"])(
    "geçersiz: %j → null",
    (input) => {
      expect(parseTRYToKurus(input)).toBeNull();
    },
  );

  it("negatif değer varsayılan olarak reddedilir, izin verilirse kabul edilir", () => {
    expect(parseTRYToKurus("-5")).toBeNull();
    expect(parseTRYToKurus("-12,50", { allowNegative: true })).toBe(-1250);
  });
});

describe("formatTRY", () => {
  it("Türk lirası biçiminde yazar", () => {
    expect(formatTRY(123450)).toBe("₺1.234,50");
    expect(formatTRY(5)).toBe("₺0,05");
    expect(formatTRY(0)).toBe("₺0,00");
    expect(formatTRY(-1250)).toBe("-₺12,50");
    expect(formatTRY(100000000)).toBe("₺1.000.000,00");
  });

  it("sembolsüz biçim form alanları için", () => {
    expect(formatKurusPlain(123456)).toBe("1.234,56");
    expect(formatKurusPlain(5)).toBe("0,05");
  });

  it("biçimlendirilen değer tekrar okunduğunda aynı kuruşa döner", () => {
    for (const k of [0, 1, 99, 100, 1250, 123456, 99999999]) {
      expect(parseTRYToKurus(formatTRY(k))).toBe(k);
    }
  });
});

describe("tam sayı yuvarlama", () => {
  it("yarım yukarı (sıfırdan uzağa) yuvarlar", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(5, 3)).toBe(2);
    expect(divRound(0, 7)).toBe(0);
  });

  it("çok büyük ara çarpımlarda taşma olmaz", () => {
    expect(mulDivRound(9_000_000_000_000, 1000, 3000)).toBe(3_000_000_000_000);
  });

  it("float kullanan hesabın şaşırdığı değerlerde doğru sonuç verir", () => {
    // 1.005 * 100 float ile 100.49999… olur; tam sayı hesabı etkilenmez.
    expect(mulDivRound(1005, 100, 1000)).toBe(101);
  });
});

describe("formatMargin", () => {
  it("ciro 0 ise — gösterir", () => {
    expect(formatMargin(0, 0)).toBe("—");
    expect(formatMargin(500, 0)).toBe("—");
  });
  it("tek ondalıklı yüzde", () => {
    expect(formatMargin(3000, 8333)).toBe("%36,0");
    expect(formatMargin(-100, 1000)).toBe("-%10,0");
    expect(formatMargin(1, 3)).toBe("%33,3");
  });
});

describe("panel yardımcıları", async () => {
  const { formatPermille, changePermille, formatTRYShort } = await import("@/lib/money");
  it("yüzde değişim (önceki 0 ise tanımsız)", () => {
    expect(changePermille(1200, 1000)).toBe(200);
    expect(changePermille(800, 1000)).toBe(-200);
    expect(changePermille(500, 0)).toBeNull();
    expect(changePermille(-500, -1000)).toBe(500);
    expect(formatPermille(123)).toBe("%12,3");
    expect(formatPermille(-5)).toBe("-%0,5");
    expect(formatPermille(null)).toBe("—");
  });
  it("kısa TL", () => {
    expect(formatTRYShort(123456)).toBe("₺1.235");
    expect(formatTRYShort(0)).toBe("₺0");
  });
});
