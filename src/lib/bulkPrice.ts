/**
 * Toplu fiyat güncelleme hesabı (saf, tam sayı kuruş). Sunucu ve önizleme aynı fonksiyonu kullanır.
 */
import { divRound, mulDivRound } from "./money";

export type BulkMode = "percent" | "amount";
export type BulkDirection = "increase" | "decrease";
export type BulkRounding = "none" | "r50" | "r100" | "end90";

export interface BulkChange {
  mode: BulkMode;
  direction: BulkDirection;
  /** percent: yüzdenin 100 katı (7,5% → 750); amount: kuruş */
  value: number;
  rounding: BulkRounding;
}

/** Yeni fiyat; sonuç 0 veya altına düşüyorsa null. */
export function applyBulkChange(priceKurus: number, c: BulkChange): number | null {
  const delta = c.mode === "percent" ? mulDivRound(priceKurus, c.value, 10000) : c.value;
  let p = c.direction === "increase" ? priceKurus + delta : priceKurus - delta;
  if (p <= 0) return null;
  switch (c.rounding) {
    case "r50":
      p = divRound(p, 50) * 50;
      break;
    case "r100":
      p = divRound(p, 100) * 100;
      break;
    case "end90": {
      // x,90 ile biten en yakın fiyat (en küçük ≥ p olan değil, en yakını)
      const lira = (p - (p % 100)) / 100;
      const below = (lira - 1) * 100 + 90;
      const same = lira * 100 + 90;
      p = Math.abs(same - p) <= Math.abs(p - below) || below <= 0 ? same : below;
      break;
    }
  }
  return p > 0 ? p : null;
}
