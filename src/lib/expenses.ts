/** Gider kategorileri (sunucu ve ekran ortak). Veritabanındaki CHECK listesiyle aynı olmalı (migration 005). */
export const EXPENSE_CATEGORIES = [
  { key: "kira", label: "Kira" },
  { key: "personel", label: "Personel / maaş" },
  { key: "elektrik", label: "Elektrik" },
  { key: "su", label: "Su" },
  { key: "dogalgaz", label: "Doğalgaz" },
  { key: "iletisim", label: "İnternet / telefon" },
  { key: "vergi", label: "Vergi / SGK" },
  { key: "muhasebe", label: "Muhasebe" },
  { key: "bakim", label: "Bakım / onarım" },
  { key: "nakliye", label: "Nakliye / yakıt" },
  { key: "kirtasiye", label: "Kırtasiye / sarf malzemesi" },
  { key: "diger", label: "Diğer" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];

export const EXPENSE_VAT_RATES = [0, 1, 10, 20] as const;

export function expenseCategoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
