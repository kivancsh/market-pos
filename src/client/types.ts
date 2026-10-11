/** Sunucudan gelen yanıt tipleri (tarayıcı tarafı). */
export type { CatalogItem } from "@/server/services/products";

export interface KasaSettings {
  businessName: string;
  /** Yazar kasa (ÖKC) çalışma şekli */
  okcMode: import("@/lib/okc").OkcMode;
  cashierCanDiscount: boolean;
  scannerMaxIntervalMs: number;
  scannerMinLength: number;
  scannerDupWindowMs: number;
  soundEnabled: boolean;
}

export type Role = "owner" | "cashier";
