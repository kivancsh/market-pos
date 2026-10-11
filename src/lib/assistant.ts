/**
 * Yapay zekâ asistanı — sunucu ve tarayıcı ortak tanımlar (hedef türleri, ay adları, hedef ilerleme hesabı).
 * Bütün hesaplar tam sayıyla (para kuruş, oran binde).
 */
import { mulDivRound } from "./money";

export const TARGET_METRICS = ["revenue", "gross_profit", "net_profit", "margin", "avg_basket", "sale_count", "expenses"] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

/** Hedefin birimi: para (kuruş), binde (marj), adet. */
export type MetricUnit = "money" | "permille" | "count";

export const METRIC_INFO: Record<TargetMetric, { label: string; unit: MetricUnit; lowerIsBetter?: boolean; cumulative: boolean; hint: string }> = {
  revenue: { label: "Ciro (KDV dahil)", unit: "money", cumulative: true, hint: "Satışlar − iadeler" },
  gross_profit: { label: "Brüt kâr", unit: "money", cumulative: true, hint: "KDV hariç ciro − KDV hariç maliyet" },
  net_profit: { label: "Net kâr", unit: "money", cumulative: true, hint: "Brüt kâr − giderler" },
  margin: { label: "Kâr marjı", unit: "permille", cumulative: false, hint: "Brüt kâr / KDV hariç ciro" },
  avg_basket: { label: "Ortalama sepet", unit: "money", cumulative: false, hint: "Satış başına ortalama tutar" },
  sale_count: { label: "Satış sayısı", unit: "count", cumulative: true, hint: "Tamamlanan satış (fiş) adedi" },
  expenses: { label: "Gider bütçesi", unit: "money", lowerIsBetter: true, cumulative: true, hint: "KDV hariç giderler (üst sınır)" },
};

export function isTargetMetric(v: unknown): v is TargetMetric {
  return typeof v === "string" && (TARGET_METRICS as readonly string[]).includes(v);
}

export const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "2026-10" → "Ekim 2026" */
export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function isMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** "2026-10" → bir sonraki/önceki ay */
export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

export type PaceStatus = "ahead" | "on_track" | "behind" | "no_data";

export const PACE_LABELS: Record<PaceStatus, string> = {
  ahead: "Hedefin önünde",
  on_track: "Yolunda",
  behind: "Geride",
  no_data: "Henüz veri yok",
};

export interface TargetProgress {
  metric: TargetMetric;
  target: number;
  baseline: number;
  actual: number;
  /** Bugüne kadar beklenen (birikimli hedeflerde haftanın günlerine göre ağırlıklı) */
  expectedToDate: number | null;
  /** Ay sonu tahmini (birikimli hedeflerde bugünkü gidişle) */
  forecast: number | null;
  /** Gerçekleşme / hedef (binde) */
  achievementPermille: number | null;
  status: PaceStatus;
}

/**
 * Hedef ilerlemesi. `elapsedSharePermille`: ayın bugüne kadarki "beklenen satış payı" (binde, hafta günü ağırlıklı).
 * Birikimli hedeflerde gidiş = gerçekleşen / beklenen; ±%3 içi "yolunda". Oran hedeflerinde doğrudan karşılaştırma.
 */
export function targetProgress(
  metric: TargetMetric,
  target: number,
  baseline: number,
  actual: number,
  elapsedSharePermille: number,
  hasData: boolean,
): TargetProgress {
  const info = METRIC_INFO[metric];
  const base = { metric, target, baseline, actual };
  if (!hasData || elapsedSharePermille <= 0) {
    return { ...base, expectedToDate: info.cumulative ? 0 : null, forecast: null, achievementPermille: null, status: "no_data" };
  }
  const tolerance = 30; // binde 30 = %3
  if (info.cumulative) {
    const expectedToDate = mulDivRound(target, Math.min(elapsedSharePermille, 1000), 1000);
    const forecast = elapsedSharePermille >= 1000 ? actual : mulDivRound(actual, 1000, elapsedSharePermille);
    const achievementPermille = target !== 0 ? mulDivRound(actual, 1000, target) : null;
    let status: PaceStatus;
    if (info.lowerIsBetter) {
      // Giderler ayın başında toplu gelir (kira); ay sonu tahmini yerine bütçeyi aşıp aşmadığına bakılır.
      status = actual > target ? "behind" : actual * 1000 <= target * (1000 - 100) ? "ahead" : "on_track";
      return { ...base, expectedToDate, forecast: Math.max(actual, target), achievementPermille, status };
    }
    if (expectedToDate === 0) status = actual > 0 ? "ahead" : "on_track";
    else {
      const ratio = mulDivRound(actual, 1000, expectedToDate);
      status = ratio >= 1000 + tolerance ? "ahead" : ratio >= 1000 - tolerance ? "on_track" : "behind";
    }
    return { ...base, expectedToDate, forecast, achievementPermille, status };
  }
  const diff = actual - target;
  const tol = metric === "margin" ? 5 : Math.abs(mulDivRound(target, tolerance, 1000));
  const status: PaceStatus = diff > tol ? "ahead" : diff >= -tol ? "on_track" : "behind";
  return { ...base, expectedToDate: null, forecast: null, achievementPermille: target !== 0 ? mulDivRound(actual, 1000, target) : null, status };
}

export const ACTION_AREAS = ["fiyat", "stok", "urun", "gider", "personel", "kasa", "satis", "musteri"] as const;
export type ActionArea = (typeof ACTION_AREAS)[number];
export const ACTION_AREA_LABELS: Record<ActionArea, string> = {
  fiyat: "Fiyat ve marj",
  stok: "Stok",
  urun: "Ürün ve raf",
  gider: "Giderler",
  personel: "Personel",
  kasa: "Kasa kontrolü",
  satis: "Satış artırma",
  musteri: "Müşteri",
};

export const ANALYSIS_AREAS = ["ciro", "kar", "urun", "kategori", "fiyat", "stok", "gider", "zaman", "sepet", "iade", "kasa", "personel"] as const;
/** Raporun analiz alanları (yapay zekâ her biri için not ve bulgu yazar). */
export const ANALYSIS_AREA_LABELS: Record<(typeof ANALYSIS_AREAS)[number], string> = {
  ciro: "Ciro ve müşteri",
  kar: "Kârlılık",
  urun: "Ürünler",
  kategori: "Kategoriler",
  fiyat: "Fiyat ve maliyet",
  stok: "Stok",
  gider: "Giderler",
  zaman: "Gün ve saatler",
  sepet: "Sepet",
  iade: "İade ve iptal",
  kasa: "Kasa kontrolü",
  personel: "Personel",
};

export type ActionStatus = "open" | "done" | "skipped";
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = { open: "Yapılacak", done: "Yapıldı", skipped: "Atlandı" };

/** Yapay zekâ metnindeki takma adları ("Kasiyer 1001") yöneticinin göreceği adla değiştirir: "Mehmet (Kasiyer 1001)". */
export function withStaffNames(text: string, aliasNames: Record<string, string>): string {
  const aliases = Object.keys(aliasNames).sort((a, b) => b.length - a.length);
  if (aliases.length === 0) return text;
  const re = new RegExp(`(${aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![0-9])`, "g");
  return text.replace(re, (m) => `${aliasNames[m]} (${m})`);
}
