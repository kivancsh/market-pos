import { z } from "./zod";

/** Kuruş tutarı: 0 ile 10.000.000 TL arası tam sayı. */
export const kurusSchema = z.int().min(0).max(1_000_000_000);
export const qtySchema = z.int().min(1).max(100_000);
export const idSchema = z.int().positive();
export const vatRateSchema = z.union([z.literal(1), z.literal(10), z.literal(20)]);
export const paymentMethodSchema = z.enum(["cash", "card"]);
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
