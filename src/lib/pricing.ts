/**
 * KDV, kâr, indirim dağıtımı ve ağırlıklı ortalama maliyet hesapları.
 * Formüller CLAUDE.md "Para / KDV / Kâr" bölümündekiyle birebir aynıdır. Tüm değerler tam sayı kuruş.
 */
import { mulDivRound } from "./money";

export const VAT_RATES = [1, 10, 20] as const;
export type VatRate = (typeof VAT_RATES)[number];

export function isVatRate(n: number): n is VatRate {
  return (VAT_RATES as readonly number[]).includes(n);
}

/** KDV dahil tutardan KDV hariç tutarı ayırır: round(tutar * 100 / (100 + kdv)). */
export function netOfVat(grossKurus: number, vatRate: number): number {
  return mulDivRound(grossKurus, 100, 100 + vatRate);
}

export interface LineInput {
  unitPriceKurus: number; // KDV dahil satış fiyatı
  unitCostKurus: number; // KDV dahil ortalama maliyet
  qty: number;
  vatRate: number;
  lineDiscountKurus: number;
}

export interface LineAmounts {
  lineGrossKurus: number;
  lineDiscountKurus: number;
  lineTotalKurus: number;
  lineNetKurus: number;
  lineVatKurus: number;
  lineCostKurus: number;
  lineCostNetKurus: number;
  lineProfitKurus: number;
}

export function computeLine(input: LineInput): LineAmounts {
  const { unitPriceKurus, unitCostKurus, qty, vatRate, lineDiscountKurus } = input;
  const lineGrossKurus = unitPriceKurus * qty;
  const lineTotalKurus = lineGrossKurus - lineDiscountKurus;
  if (lineTotalKurus < 0) throw new RangeError("İndirim satır tutarından büyük olamaz");
  const lineNetKurus = netOfVat(lineTotalKurus, vatRate);
  const lineVatKurus = lineTotalKurus - lineNetKurus;
  const lineCostKurus = unitCostKurus * qty;
  const lineCostNetKurus = netOfVat(lineCostKurus, vatRate);
  const lineProfitKurus = lineNetKurus - lineCostNetKurus;
  for (const v of [lineGrossKurus, lineCostKurus]) {
    if (!Number.isSafeInteger(v)) throw new RangeError("Tutar çok büyük");
  }
  return {
    lineGrossKurus,
    lineDiscountKurus,
    lineTotalKurus,
    lineNetKurus,
    lineVatKurus,
    lineCostKurus,
    lineCostNetKurus,
    lineProfitKurus,
  };
}

export type CartDiscount = { type: "amount"; value: number } | { type: "percent"; value: number };

/**
 * Sepet indiriminin TL karşılığını (kuruş) hesaplar.
 * - amount: value kuruştur.
 * - percent: value tam sayı yüzdedir (0–100); tutar = round(araToplam * yüzde / 100).
 * İndirim ara toplamı aşarsa hata fırlatır.
 */
export function resolveCartDiscount(subtotalKurus: number, discount: CartDiscount | null): number {
  if (!discount) return 0;
  if (!Number.isSafeInteger(discount.value) || discount.value < 0) {
    throw new RangeError("İndirim değeri geçersiz");
  }
  let amount: number;
  if (discount.type === "percent") {
    if (discount.value > 100) throw new RangeError("İndirim yüzdesi 100'den büyük olamaz");
    amount = mulDivRound(subtotalKurus, discount.value, 100);
  } else {
    amount = discount.value;
  }
  if (amount > subtotalKurus) throw new RangeError("İndirim ara toplamdan büyük olamaz");
  return amount;
}

/**
 * Sepet indirimini satır brüt tutarları oranında dağıtır ("en büyük kalan" yöntemi).
 * Garanti: sonuçların toplamı = indirim (kuruşu kuruşuna) ve hiçbir satırın indirimi kendi tutarını aşmaz.
 * Eşit kalanlarda önce brütü büyük satır, sonra listede önce gelen satır kuruşu alır.
 */
export function distributeDiscount(lineGrosses: number[], discountKurus: number): number[] {
  const total = lineGrosses.reduce((a, b) => a + b, 0);
  if (discountKurus < 0 || !Number.isSafeInteger(discountKurus)) {
    throw new RangeError("İndirim geçersiz");
  }
  if (discountKurus > total) throw new RangeError("İndirim ara toplamdan büyük olamaz");
  if (discountKurus === 0 || total === 0) return lineGrosses.map(() => 0);

  const D = BigInt(discountKurus);
  const T = BigInt(total);
  const parts = lineGrosses.map((g, index) => {
    const num = D * BigInt(g);
    return { index, gross: g, base: Number(num / T), rem: num % T };
  });

  let remaining = discountKurus - parts.reduce((a, p) => a + p.base, 0);
  const order = [...parts].sort((a, b) => {
    if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1;
    if (a.gross !== b.gross) return b.gross - a.gross;
    return a.index - b.index;
  });
  const result = parts.map((p) => p.base);
  for (const p of order) {
    if (remaining === 0) break;
    // rem > 0 olan satırda base < gerçek pay <= brüt olduğundan +1 brütü aşmaz.
    if (p.rem === 0n) continue;
    result[p.index]! += 1;
    remaining -= 1;
  }
  if (remaining !== 0) throw new Error("İndirim dağıtımı tutarsız"); // matematiksel olarak olamaz
  return result;
}

/**
 * Ağırlıklı ortalama maliyet (mal girişinde):
 *   eski = max(mevcutStok, 0)
 *   eski > 0 ? round((eski*eskiOrt + adet*birim) / (eski + adet)) : birim
 */
export function weightedAverageCost(
  currentStock: number,
  currentAvgCostKurus: number,
  incomingQty: number,
  incomingUnitCostKurus: number,
): number {
  if (!Number.isSafeInteger(incomingQty) || incomingQty <= 0) {
    throw new RangeError("Giren adet pozitif tam sayı olmalı");
  }
  const old = Math.max(currentStock, 0);
  if (old === 0) return incomingUnitCostKurus;
  const totalValue =
    BigInt(old) * BigInt(currentAvgCostKurus) + BigInt(incomingQty) * BigInt(incomingUnitCostKurus);
  const totalQty = BigInt(old + incomingQty);
  return Number((2n * totalValue + totalQty) / (2n * totalQty));
}

/**
 * Kısmi iadede birikimli pay: satırın X tutarından, toplam `qty` adetten `n` adede düşen kısım.
 * f(n) = round(X * n / qty). k adet iade (önce r adet iade edilmişse) = f(r+k) - f(r).
 * Böylece parça parça yapılan iadelerin toplamı tam iadeye kuruşu kuruşuna eşit olur.
 */
export function proportionalShare(lineAmountKurus: number, qty: number, n: number): number {
  return mulDivRound(lineAmountKurus, n, qty);
}

export function incrementalShare(
  lineAmountKurus: number,
  qty: number,
  alreadyReturned: number,
  returningNow: number,
): number {
  return (
    proportionalShare(lineAmountKurus, qty, alreadyReturned + returningNow) -
    proportionalShare(lineAmountKurus, qty, alreadyReturned)
  );
}

export interface UnitEconomics {
  netPriceKurus: number;
  netCostKurus: number;
  /** Birim brüt kâr (KDV hariç). */
  profitKurus: number;
}

/** Ürün listesi için birim kâr: KDV hariç satış fiyatı − KDV hariç ortalama maliyet. */
export function unitEconomics(salePriceKurus: number, avgCostKurus: number, vatRate: number): UnitEconomics {
  const netPriceKurus = netOfVat(salePriceKurus, vatRate);
  const netCostKurus = netOfVat(avgCostKurus, vatRate);
  return { netPriceKurus, netCostKurus, profitKurus: netPriceKurus - netCostKurus };
}
