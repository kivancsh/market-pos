import { getSettings } from "@/server/db/repositories/settings";
import { apiRoute } from "@/server/http/api";

/** Ayarlar. Kasiyer sadece kasa için gerekenleri görür. */
export const GET = apiRoute(["owner", "cashier"], ({ ctx, role }) => {
  const s = getSettings(ctx.db);
  if (role === "owner") return s;
  return {
    businessName: s.businessName,
    cashierCanDiscount: s.cashierCanDiscount,
    scannerMaxIntervalMs: s.scannerMaxIntervalMs,
    scannerMinLength: s.scannerMinLength,
    scannerDupWindowMs: s.scannerDupWindowMs,
    soundEnabled: s.soundEnabled,
  };
});
