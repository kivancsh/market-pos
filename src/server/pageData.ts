import type { KasaSettings } from "@/client/types";
import { getDb } from "./db/connection";
import { getSettings } from "./db/repositories/settings";

/** Okuyucu ve ses ayarları (sayfalara prop olarak verilir). */
export function getClientSettings(): KasaSettings {
  const s = getSettings(getDb());
  return {
    businessName: s.businessName,
    okcMode: s.okcMode,
    cashierCanDiscount: s.cashierCanDiscount,
    scannerMaxIntervalMs: s.scannerMaxIntervalMs,
    scannerMinLength: s.scannerMinLength,
    scannerDupWindowMs: s.scannerDupWindowMs,
    soundEnabled: s.soundEnabled,
  };
}
