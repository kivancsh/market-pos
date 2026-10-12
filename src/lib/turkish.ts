/**
 * Rakamdan sonra gelen Türkçe ek: ek, sayının okunuşunun son kelimesine göre uyumlanır.
 * "%55,6" → "elli beş virgül altı" → altı-sı → "%55,6'sı"; "3" → üç-ü → "3'ü"; "40" → kırk-ı → "40'ı".
 */
const DIGITS = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const VOWELS = "aeıioöuü";

/** Sayı metninin (₺, %, nokta, virgül olabilir) okunuşundaki son kelime. */
function lastWord(text: string): string {
  const s = text.replace(/[^\d,]/g, "");
  if (s.includes(",")) return DIGITS[Number(s.slice(-1))] ?? "sıfır";
  const n = Number(s || "0");
  if (n === 0) return "sıfır";
  if (n % 10) return DIGITS[n % 10]!;
  if (n % 100) return TENS[(n % 100) / 10]!;
  if (n % 1000) return "yüz";
  if (n % 1_000_000) return "bin";
  return "milyon";
}

/** Dar ünlü uyumu (ı/i/u/ü) için son kelimenin son ünlüsü. */
function narrow(word: string): "ı" | "i" | "u" | "ü" {
  const v = [...word].reverse().find((c) => VOWELS.includes(c)) ?? "i";
  return "aı".includes(v) ? "ı" : "ei".includes(v) ? "i" : "ou".includes(v) ? "u" : "ü";
}

export type SuffixKind = "poss" | "acc" | "loc";

/** poss: iyelik (%55,6'sı), acc: iyelik+belirtme (%80'ini), loc: iyelik+bulunma (5'inde). */
export function numberSuffix(text: string, kind: SuffixKind): string {
  const w = lastWord(text);
  const v = narrow(w);
  const buffer = VOWELS.includes(w.slice(-1)) ? "s" : "";
  const poss = buffer + v;
  if (kind === "poss") return poss;
  if (kind === "acc") return `${poss}n${v}`;
  return `${poss}nd${v === "ı" || v === "u" ? "a" : "e"}`;
}

/** "%55,6" + iyelik → "%55,6'sı" */
export function withSuffix(text: string, kind: SuffixKind): string {
  return `${text}'${numberSuffix(text, kind)}`;
}
