/**
 * Para yardımcıları. Tüm tutarlar TAM SAYI KURUŞ'tur; burada float ile para hesabı yapılmaz.
 */

function assertSafeInt(n: number, label: string): void {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`${label} güvenli bir tam sayı olmalı: ${n}`);
  }
}

/**
 * Tam sayı bölmesi, en yakına yuvarlar; tam yarıda sıfırdan uzağa (12,5 → 13; -12,5 → -13).
 * Sadece tam sayı aritmetiği kullanır (BigInt), bu yüzden hiçbir büyüklükte kayan nokta hatası yoktur.
 */
export function divRound(numerator: number, denominator: number): number {
  assertSafeInt(numerator, "Pay");
  assertSafeInt(denominator, "Payda");
  if (denominator === 0) throw new RangeError("Sıfıra bölme");
  const neg = numerator < 0 !== denominator < 0;
  const n = BigInt(Math.abs(numerator));
  const d = BigInt(Math.abs(denominator));
  const q = (2n * n + d) / (2n * d); // BigInt bölmesi aşağı keser: floor((n + d/2) / d)
  const result = Number(q);
  return neg ? -result : result;
}

/** a * b / c, en yakına yuvarlanmış. Ara çarpım BigInt ile yapılır (taşma olmaz). */
export function mulDivRound(a: number, b: number, c: number): number {
  assertSafeInt(a, "a");
  assertSafeInt(b, "b");
  assertSafeInt(c, "c");
  if (c === 0) throw new RangeError("Sıfıra bölme");
  const p = BigInt(a) * BigInt(b);
  const neg = p < 0n !== c < 0;
  const n = p < 0n ? -p : p;
  const d = BigInt(Math.abs(c));
  const q = (2n * n + d) / (2n * d);
  const result = Number(neg ? -q : q);
  assertSafeInt(result, "Sonuç");
  return result;
}

const TRY_FORMAT = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

/** Kuruşu ekranda gösterilecek metne çevirir: 123450 → "₺1.234,50". */
export function formatTRY(kurus: number): string {
  assertSafeInt(kurus, "Tutar");
  const neg = kurus < 0;
  const abs = Math.abs(kurus);
  const lira = (abs - (abs % 100)) / 100;
  const frac = String(abs % 100).padStart(2, "0");
  // Intl'e ondalık sayı yerine metin veriyoruz; böylece arada float oluşmaz.
  return TRY_FORMAT.format(`${neg ? "-" : ""}${lira}.${frac}` as Intl.StringNumericLiteral);
}

/** Kuruşu sembolsüz "1.234,50" biçiminde yazar (form alanlarına değer koymak için). */
export function formatKurusPlain(kurus: number): string {
  assertSafeInt(kurus, "Tutar");
  const neg = kurus < 0;
  const abs = Math.abs(kurus);
  const lira = String((abs - (abs % 100)) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${lira},${String(abs % 100).padStart(2, "0")}`;
}

export interface ParseTRYOptions {
  allowNegative?: boolean;
}

/**
 * Kullanıcının yazdığı tutarı kuruşa çevirir. Geçersizse null döner.
 * Kabul edilenler: "12", "12,5", "12,50", "12.50", "1.234,56", "1,234.56", "1.234", "₺12,50", "12,50 TL".
 * Kurallar:
 *  - Hem nokta hem virgül varsa: en sağdaki ondalık ayırıcıdır, diğeri binlik ayırıcı.
 *  - Sadece virgül varsa: ondalık ayırıcıdır (Türkçe alışkanlık).
 *  - Sadece nokta varsa: noktadan sonra tam 3 rakam gruplar halinde geliyorsa binlik ("1.234"),
 *    aksi halde tek nokta ondalık ayırıcıdır ("12.50").
 *  - Ondalık kısım en fazla 2 hane olabilir.
 */
export function parseTRYToKurus(input: string, options: ParseTRYOptions = {}): number | null {
  let s = input.replace(/₺|TL|TRY/gi, "").replace(/\s/g, "");
  if (s === "") return null;

  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (negative && !options.allowNegative) return null;
  if (!/^[\d.,]+$/.test(s)) return null;

  let intPart: string;
  let fracPart = "";

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? "." : ",";
    const thouSep = decSep === "." ? "," : ".";
    const decIdx = s.lastIndexOf(decSep);
    intPart = s.slice(0, decIdx);
    fracPart = s.slice(decIdx + 1);
    if (intPart.includes(decSep)) return null;
    if (!isGroupedThousands(intPart, thouSep)) return null;
    intPart = intPart.split(thouSep).join("");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    if (parts.length !== 2) return null;
    [intPart, fracPart] = parts as [string, string];
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1]!.length === 3)) {
      if (!isGroupedThousands(s, ".")) return null;
      intPart = parts.join("");
    } else {
      [intPart, fracPart] = parts as [string, string];
    }
  } else {
    intPart = s;
  }

  if (intPart === "" && fracPart === "") return null;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (fracPart.length > 2) return null;

  const kurusStr = (intPart === "" ? "0" : intPart) + fracPart.padEnd(2, "0");
  const value = Number(kurusStr);
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

/** "1.234.567" gibi binlik gruplamanın düzgün olup olmadığını kontrol eder. */
function isGroupedThousands(s: string, sep: string): boolean {
  if (!s.includes(sep)) return /^\d+$/.test(s);
  const groups = s.split(sep);
  if (!/^\d{1,3}$/.test(groups[0]!)) return false;
  return groups.slice(1).every((g) => /^\d{3}$/.test(g));
}

/**
 * Marj gösterimi: kâr / KDV hariç ciro. Ciro 0 ise "—".
 * Sonuç tek ondalıklı yüzde metnidir ("%23,4"); tam sayı aritmetiğiyle hesaplanır.
 */
export function formatMargin(profitKurus: number, netRevenueKurus: number): string {
  if (netRevenueKurus === 0) return "—";
  const permille = mulDivRound(profitKurus, 1000, netRevenueKurus); // binde
  const neg = permille < 0;
  const abs = Math.abs(permille);
  return `${neg ? "-" : ""}%${(abs - (abs % 10)) / 10},${abs % 10}`;
}

/** Marjı binde cinsinden (ör. 234 = %23,4) döndürür; ciro 0 ise null. Sıralama/filtre için. */
export function marginPermille(profitKurus: number, netRevenueKurus: number): number | null {
  if (netRevenueKurus === 0) return null;
  return mulDivRound(profitKurus, 1000, netRevenueKurus);
}
