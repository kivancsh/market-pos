/**
 * Barkod yardımcıları: EAN-13 / EAN-8 kontrol basamağı, dükkân içi barkod üretimi, normalize etme.
 */

/** GS1 kontrol basamağı (EAN-13, EAN-8, UPC-A için ortak). */
function gs1CheckDigit(digits: string): number {
  let sum = 0;
  // GS1 kuralı: kontrol basamağına en yakın (en sağdaki) hane 3 ile çarpılır, sonra 1, 3, 1...
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** EAN-13'ün ilk 12 hanesinden kontrol basamağını hesaplar. Örn. "400638133393" → 1. */
export function calcEan13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new RangeError("EAN-13 için 12 rakam gerekli");
  return gs1CheckDigit(first12);
}

/** EAN-8'in ilk 7 hanesinden kontrol basamağını hesaplar. Örn. "9638507" → 4. */
export function calcEan8CheckDigit(first7: string): number {
  if (!/^\d{7}$/.test(first7)) throw new RangeError("EAN-8 için 7 rakam gerekli");
  return gs1CheckDigit(first7);
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && calcEan13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function isValidEan8(code: string): boolean {
  return /^\d{8}$/.test(code) && calcEan8CheckDigit(code.slice(0, 7)) === Number(code[7]);
}

export const INTERNAL_PREFIX = "200";
export const INTERNAL_SEQ_MAX = 999_999_999;

/** Dükkân içi EAN-13: "200" + 9 haneli sıra + kontrol basamağı. */
export function makeInternalEan13(seq: number): string {
  if (!Number.isSafeInteger(seq) || seq < 1 || seq > INTERNAL_SEQ_MAX) {
    throw new RangeError("Barkod sıra numarası 1–999999999 arasında olmalı");
  }
  const first12 = INTERNAL_PREFIX + String(seq).padStart(9, "0");
  return first12 + String(calcEan13CheckDigit(first12));
}

/** Kontrol karakterlerini ve tüm boşlukları siler. */
export function cleanBarcode(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F\s]/g, "");
}

export type NormalizeResult =
  | {
      ok: true;
      /** Temizlenmiş değer (okutulan barkod olarak kaydedilir). */
      code: string;
      /** Sırayla aranacak adaylar. */
      candidates: string[];
    }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "invalid_check_digit"; code: string };

/**
 * Okuyucudan / klavyeden gelen ham değeri normalize eder (CLAUDE.md "Barkod" bölümü):
 * 1. Kontrol karakterleri ve boşluklar silinir.
 * 2. Tamamen rakamsa: 13 veya 8 hane → kontrol basamağı doğrulanır (hatalıysa eşleştirme yok);
 *    12 hane (UPC-A) → önce olduğu gibi, sonra başına "0" eklenerek aranır.
 * 3. Rakam dışı karakter varsa olduğu gibi (büyük/küçük harf duyarlı) aranır.
 */
export function normalizeBarcode(raw: string): NormalizeResult {
  const code = cleanBarcode(raw);
  if (code === "") return { ok: false, reason: "empty" };
  if (/^\d+$/.test(code)) {
    if (code.length === 13 && !isValidEan13(code)) {
      return { ok: false, reason: "invalid_check_digit", code };
    }
    if (code.length === 8 && !isValidEan8(code)) {
      return { ok: false, reason: "invalid_check_digit", code };
    }
    if (code.length === 12) return { ok: true, code, candidates: [code, "0" + code] };
  }
  return { ok: true, code, candidates: [code] };
}

/**
 * Bir ürüne kaydedilecek barkodun biçimini kontrol eder. Geçerliyse temizlenmiş barkodu,
 * değilse Türkçe hata mesajını döndürür. (13/8 haneli rakamsal barkodun kontrol basamağı
 * hatalıysa kaydedilmez; çünkü kasada asla eşleşemez.)
 */
export function validateBarcodeForStorage(raw: string): { ok: true; code: string } | { ok: false; message: string } {
  const r = normalizeBarcode(raw);
  if (!r.ok) {
    return {
      ok: false,
      message: r.reason === "empty" ? "Barkod boş olamaz." : "Barkodun kontrol basamağı hatalı.",
    };
  }
  if (r.code.length > 64) return { ok: false, message: "Barkod en fazla 64 karakter olabilir." };
  return { ok: true, code: r.code };
}
