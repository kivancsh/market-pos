/** Sunucudan gelen yanıt tipleri (tarayıcı tarafı). */
export type { CatalogItem } from "@/server/services/products";

export interface KasaSettings {
  businessName: string;
  cashierCanDiscount: boolean;
  scannerMaxIntervalMs: number;
  scannerMinLength: number;
  scannerDupWindowMs: number;
  soundEnabled: boolean;
}

export type Role = "owner" | "cashier";
