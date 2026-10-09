import type { Ctx } from "../context";
import { getSettings, saveSettings, type Settings } from "../db/repositories/settings";
import { kurusSchema } from "../validation/common";
import { parseInput, z } from "../validation/zod";

export const updateSettingsSchema = z
  .object({
    businessName: z.string().trim().min(1, "İşletme adı boş olamaz.").max(60),
    allowNegativeStock: z.boolean(),
    cashierCanDiscount: z.boolean(),
    scannerMaxIntervalMs: z.int().min(10).max(500),
    scannerMinLength: z.int().min(3).max(30),
    scannerDupWindowMs: z.int().min(0).max(1000),
    soundEnabled: z.boolean(),
    openingCashKurus: kurusSchema,
    labelCols: z.int().min(1).max(10),
    labelRows: z.int().min(1).max(20),
  })
  .partial()
  .strict();

export function updateSettings(ctx: Ctx, input: z.input<typeof updateSettingsSchema>): Settings {
  const data = parseInput(updateSettingsSchema, input);
  ctx.db.transaction(() => saveSettings(ctx.db, data)).immediate();
  return getSettings(ctx.db);
}
