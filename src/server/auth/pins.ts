import crypto from "node:crypto";
import type { Role } from "../db/repositories/sales";

export const DEFAULT_OWNER_PIN = "1234";
export const DEFAULT_CASHIER_PIN = "0000";

function readPins(): { owner: string; cashier: string } {
  const owner = process.env.OWNER_PIN?.trim() || DEFAULT_OWNER_PIN;
  const cashier = process.env.CASHIER_PIN?.trim() || DEFAULT_CASHIER_PIN;
  for (const [name, pin] of [["OWNER_PIN", owner], ["CASHIER_PIN", cashier]] as const) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error(`${name} 4-8 haneli rakamlardan oluşmalı (.env dosyasını kontrol edin).`);
  }
  if (owner === cashier) throw new Error("OWNER_PIN ile CASHIER_PIN aynı olamaz (.env dosyasını kontrol edin).");
  return { owner, cashier };
}

/** Varsayılan PIN'lerden biri hâlâ kullanılıyor mu? (Panelde uyarı gösterilir.) */
export function usesDefaultPins(): boolean {
  const { owner, cashier } = readPins();
  return owner === DEFAULT_OWNER_PIN || cashier === DEFAULT_CASHIER_PIN;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** PIN hangi role aitse onu döndürür; hiçbirine uymuyorsa null. */
export function matchPin(pin: string): Role | null {
  const { owner, cashier } = readPins();
  const isOwner = safeEqual(pin, owner);
  const isCashier = safeEqual(pin, cashier);
  if (isOwner) return "owner";
  if (isCashier) return "cashier";
  return null;
}
