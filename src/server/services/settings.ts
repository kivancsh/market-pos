import type { Ctx } from "../context";
import { getSettings, saveSettings, type Settings } from "../db/repositories/settings";
import { kurusSchema } from "../validation/common";
import { parseInput, z } from "../validation/zod";
import { formatTRY } from "@/lib/money";
import { audit } from "./audit";

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

const LABELS: Record<keyof Settings, string> = {
  businessName: "işletme adı",
  allowNegativeStock: "eksi stok",
  cashierCanDiscount: "kasiyer indirimi",
  scannerMaxIntervalMs: "okuyucu tuş aralığı",
  scannerMinLength: "okuyucu en az karakter",
  scannerDupWindowMs: "çift okuma süresi",
  soundEnabled: "ses",
  openingCashKurus: "açılış kasası",
  labelCols: "etiket sütun",
  labelRows: "etiket satır",
};

export function updateSettings(ctx: Ctx, input: z.input<typeof updateSettingsSchema>): Settings {
  const data = parseInput(updateSettingsSchema, input);
  return ctx.db
    .transaction((): Settings => {
      const before = getSettings(ctx.db);
      saveSettings(ctx.db, data);
      const after = getSettings(ctx.db);
      const fmt = (k: keyof Settings, v: unknown) =>
        k === "openingCashKurus" ? formatTRY(v as number) : typeof v === "boolean" ? (v ? "açık" : "kapalı") : String(v);
      const changes = (Object.keys(LABELS) as (keyof Settings)[])
        .filter((k) => before[k] !== after[k])
        .map((k) => `${LABELS[k]}: ${fmt(k, before[k])} → ${fmt(k, after[k])}`);
      if (changes.length) audit(ctx, "settings.update", changes.join("; "));
      return after;
    })
    .immediate();
}
