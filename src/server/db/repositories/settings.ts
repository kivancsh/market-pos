import { OKC_MODES, type OkcMode } from "@/lib/okc";
import type { DB } from "../types";

export interface Settings {
  businessName: string;
  allowNegativeStock: boolean;
  cashierCanDiscount: boolean;
  scannerMaxIntervalMs: number;
  scannerMinLength: number;
  scannerDupWindowMs: number;
  soundEnabled: boolean;
  openingCashKurus: number;
  labelCols: number;
  labelRows: number;
  /** Günlük rapor e-postası (Günü Kapat'ta ve gün kapatılmazsa bu saatte) */
  dailyReportEnabled: boolean;
  /** "HH:MM", İstanbul saati */
  dailyReportTime: string;
  /** Yazar kasa (ÖKC) çalışma şekli; bkz. src/lib/okc.ts */
  okcMode: OkcMode;
}

export const SETTING_KEYS = {
  businessName: "business_name",
  allowNegativeStock: "allow_negative_stock",
  cashierCanDiscount: "cashier_can_discount",
  scannerMaxIntervalMs: "scanner_max_interval_ms",
  scannerMinLength: "scanner_min_length",
  scannerDupWindowMs: "scanner_dup_window_ms",
  soundEnabled: "sound_enabled",
  openingCashKurus: "opening_cash_kurus",
  labelCols: "label_cols",
  labelRows: "label_rows",
  dailyReportEnabled: "daily_report_enabled",
  dailyReportTime: "daily_report_time",
  okcMode: "okc_mode",
} as const satisfies Record<keyof Settings, string>;

const INTERNAL_BARCODE_SEQ = "internal_barcode_seq";

function readAll(db: DB): Map<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return new Map(rows.map((r) => [r.key, r.value]));
}

function toInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : fallback;
}

export function getSettings(db: DB): Settings {
  const m = readAll(db);
  return {
    businessName: m.get(SETTING_KEYS.businessName) ?? "Dükkânım",
    allowNegativeStock: m.get(SETTING_KEYS.allowNegativeStock) === "true",
    cashierCanDiscount: m.get(SETTING_KEYS.cashierCanDiscount) === "true",
    scannerMaxIntervalMs: toInt(m.get(SETTING_KEYS.scannerMaxIntervalMs), 50),
    scannerMinLength: toInt(m.get(SETTING_KEYS.scannerMinLength), 6),
    scannerDupWindowMs: toInt(m.get(SETTING_KEYS.scannerDupWindowMs), 80),
    soundEnabled: m.get(SETTING_KEYS.soundEnabled) !== "false",
    openingCashKurus: toInt(m.get(SETTING_KEYS.openingCashKurus), 0),
    labelCols: toInt(m.get(SETTING_KEYS.labelCols), 3),
    labelRows: toInt(m.get(SETTING_KEYS.labelRows), 8),
    dailyReportEnabled: m.get(SETTING_KEYS.dailyReportEnabled) !== "false",
    dailyReportTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(m.get(SETTING_KEYS.dailyReportTime) ?? "")
      ? m.get(SETTING_KEYS.dailyReportTime)!
      : "23:30",
    okcMode: (OKC_MODES as readonly string[]).includes(m.get(SETTING_KEYS.okcMode) ?? "") ? (m.get(SETTING_KEYS.okcMode) as OkcMode) : "off",
  };
}

export function saveSettings(db: DB, patch: Partial<Settings>): void {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [k, v] of Object.entries(patch) as [keyof Settings, Settings[keyof Settings]][]) {
    if (v === undefined) continue;
    stmt.run(SETTING_KEYS[k], String(v));
  }
}

/** Dükkân içi barkod sayacını bir artırır ve yeni değeri döndürür. Transaction içinde çağrılmalı. */
export function incrementInternalBarcodeSeq(db: DB): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(INTERNAL_BARCODE_SEQ) as
    | { value: string }
    | undefined;
  const next = toInt(row?.value, 0) + 1;
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(INTERNAL_BARCODE_SEQ, String(next));
  return next;
}

/** Ayarlar tablosunda tek bir ham değer (şifreli anahtarlar vb. için; Settings arayüzünde görünmez). */
export function getRawSetting(db: DB, key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function setRawSetting(db: DB, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function deleteRawSetting(db: DB, key: string): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}
