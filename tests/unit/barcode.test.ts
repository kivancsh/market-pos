import { describe, expect, it } from "vitest";
import {
  calcEan13CheckDigit,
  calcEan8CheckDigit,
  isValidEan13,
  isValidEan8,
  makeInternalEan13,
  normalizeBarcode,
  validateBarcodeForStorage,
} from "@/lib/barcode";

describe("EAN-13 kontrol basamağı", () => {
  it("bilinen gerçek örnekler", () => {
    expect(calcEan13CheckDigit("400638133393")).toBe(1); // 4006381333931
    expect(calcEan13CheckDigit("590123412345")).toBe(7); // 5901234123457
    expect(calcEan13CheckDigit("869000000000")).toBe(5); // 8×1 + 6×3 + 9×1 = 35 → 5
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
  });
});

describe("EAN-8 kontrol basamağı", () => {
  it("bilinen gerçek örnek", () => {
    expect(calcEan8CheckDigit("9638507")).toBe(4); // 96385074
    expect(isValidEan8("96385074")).toBe(true);
    expect(isValidEan8("96385075")).toBe(false);
  });
});

describe("dükkân içi barkod", () => {
  it("200 önekli, 13 haneli, geçerli kontrol basamaklı", () => {
    const code = makeInternalEan13(1);
    expect(code).toBe("2000000000015");
    expect(isValidEan13(code)).toBe(true);
    expect(makeInternalEan13(123456789)).toMatch(/^200123456789\d$/);
    for (let i = 1; i < 500; i++) expect(isValidEan13(makeInternalEan13(i))).toBe(true);
  });
  it("aralık dışı sıra reddedilir", () => {
    expect(() => makeInternalEan13(0)).toThrow();
    expect(() => makeInternalEan13(1_000_000_000)).toThrow();
  });
});

describe("normalizeBarcode", () => {
  it("boşlukları ve \\r \\n \\t kontrol karakterlerini temizler", () => {
    expect(normalizeBarcode("  4006381333931\r\n")).toEqual({
      ok: true,
      code: "4006381333931",
      candidates: ["4006381333931"],
    });
    expect(normalizeBarcode("\t4006 3813 33931")).toMatchObject({ ok: true, code: "4006381333931" });
  });

  it("boş değer", () => {
    expect(normalizeBarcode(" \r\n")).toEqual({ ok: false, reason: "empty" });
  });

  it("hatalı kontrol basamaklı EAN-13 ve EAN-8 eşleştirilmez", () => {
    expect(normalizeBarcode("4006381333932")).toEqual({
      ok: false,
      reason: "invalid_check_digit",
      code: "4006381333932",
    });
    expect(normalizeBarcode("96385075")).toMatchObject({ ok: false, reason: "invalid_check_digit" });
    expect(normalizeBarcode("96385074")).toMatchObject({ ok: true, candidates: ["96385074"] });
  });

  it("12 haneli UPC-A: önce olduğu gibi, sonra başına 0 eklenerek aranır", () => {
    expect(normalizeBarcode("036000291452")).toEqual({
      ok: true,
      code: "036000291452",
      candidates: ["036000291452", "0036000291452"],
    });
  });

  it("alfanümerik (Code128) değer olduğu gibi, büyük/küçük harf korunarak aranır", () => {
    expect(normalizeBarcode(" AbC-123\n")).toEqual({ ok: true, code: "AbC-123", candidates: ["AbC-123"] });
  });

  it("diğer uzunluktaki rakamsal değerler olduğu gibi aranır", () => {
    expect(normalizeBarcode("123456")).toEqual({ ok: true, code: "123456", candidates: ["123456"] });
  });
});

describe("validateBarcodeForStorage", () => {
  it("geçerli barkodu temizlenmiş halde kabul eder", () => {
    expect(validateBarcodeForStorage(" 4006381333931 ")).toEqual({ ok: true, code: "4006381333931" });
  });
  it("hatalı kontrol basamağını ve boş değeri reddeder", () => {
    expect(validateBarcodeForStorage("4006381333932").ok).toBe(false);
    expect(validateBarcodeForStorage("  ").ok).toBe(false);
  });
});
