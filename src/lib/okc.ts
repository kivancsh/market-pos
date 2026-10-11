/**
 * Yazar kasa (ÖKC — yeni nesil ödeme kaydedici cihaz) entegrasyonunun ortak tanımları (sunucu + tarayıcı).
 *
 * Çalışma şekilleri:
 * - off:         Yazar kasa bağlantısı yok (ÖKC'den muaf dükkân ya da yazar kasa kullanılmıyor).
 * - manual:      Yazar kasa ayrı kullanılıyor; program her satıştan sonra fiş kesmeyi hatırlatır,
 *                gün sonunda yazar kasanın Z toplamı programın cirosuyla karşılaştırılır.
 * - simulator:   Cihazsız deneme / eğitim: yazar kasa ekranda taklit edilir.
 * - hugin_cloud: Hugin Cloud Link: Hugin yazar kasa açık satışları programdan alır, fişi basar, ödemeyi alır, sonucu bildirir.
 * - pavo_rest:   Pavo yerel ağ (REST). Pavo'nun entegrasyon belgesi gelince etkinleşir.
 */
import { divRound } from "./money";

export const OKC_MODES = ["off", "manual", "simulator", "hugin_cloud", "pavo_rest"] as const;
export type OkcMode = (typeof OKC_MODES)[number];

/** Satışın yazar kasada fiş basılmasını beklediği çalışma şekilleri. */
export const OKC_DEVICE_MODES = ["simulator", "hugin_cloud", "pavo_rest"] as const satisfies readonly OkcMode[];
export type OkcProvider = (typeof OKC_DEVICE_MODES)[number];

/** Şu an gerçekten çalışan (seçilebilen) çalışma şekilleri. pavo_rest, Pavo belgesi gelene kadar seçilemez. */
export const OKC_AVAILABLE_MODES: readonly OkcMode[] = ["off", "manual", "simulator", "hugin_cloud"];

export function isDeviceMode(mode: OkcMode): mode is OkcProvider {
  return (OKC_DEVICE_MODES as readonly string[]).includes(mode);
}

export const OKC_MODE_LABELS: Record<OkcMode, string> = {
  off: "Yazar kasa bağlantısı yok",
  manual: "Yazar kasayı ayrı kullanıyorum",
  simulator: "Deneme (yazar kasa simülatörü)",
  hugin_cloud: "Hugin (Cloud Link)",
  pavo_rest: "Pavo (yerel ağ)",
};

export const OKC_STATUSES = ["pending", "sent", "printed", "failed", "cancelled"] as const;
export type OkcStatus = (typeof OKC_STATUSES)[number];

export const OKC_STATUS_LABELS: Record<OkcStatus, string> = {
  pending: "Yazar kasaya gönderilmeyi bekliyor",
  sent: "Yazar kasada açıldı",
  printed: "Yasal fiş kesildi",
  failed: "Yazar kasa hata verdi",
  cancelled: "Fiş kesilmedi, satış iptal edildi",
};

/** Bu durumdaki satış hâlâ yazar kasayı bekliyor (kasada sonuç beklenir). */
export function isOkcOpen(status: OkcStatus): boolean {
  return status === "pending" || status === "sent";
}

/** Kasiyere ve yöneticiye dönen yazar kasa durumu (maliyet/kâr içermez). */
export interface OkcSaleStatus {
  saleId: number;
  provider: OkcProvider;
  orderId: string;
  status: OkcStatus;
  documentNo: string | null;
  zNo: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

/** Kuruşu yazar kasa protokollerinin beklediği "1234.50" biçimine çevirir (float kullanmadan). */
export function kurusToDecimalString(kurus: number): string {
  if (!Number.isSafeInteger(kurus)) throw new Error("Tutar tam sayı kuruş olmalı.");
  const neg = kurus < 0;
  const abs = Math.abs(kurus);
  return `${neg ? "-" : ""}${(abs - (abs % 100)) / 100}.${String(abs % 100).padStart(2, "0")}`;
}

/** "1234.5" / "1234,50" / 1234.5 → kuruş. Geçersizse null. Metin üzerinden çevirir (float aritmetiği yok). */
export function decimalToKurus(value: unknown): number | null {
  const s = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : typeof value === "string" ? value.trim() : "";
  const m = /^(-?)(\d{1,12})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const kurus = Number(m[2]) * 100 + Number((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -kurus : kurus;
}

/** Veri sağlığı: yazar kasa Z toplamı ile programın cirosu arasındaki fark binde kaç (‰). Ciro 0 ise null. */
export function zDifferencePermille(zTotalKurus: number, appTotalKurus: number): number | null {
  if (appTotalKurus === 0) return zTotalKurus === 0 ? 0 : null;
  return divRound(Math.abs(zTotalKurus - appTotalKurus) * 1000, Math.abs(appTotalKurus));
}

/** %5'ten büyük fark: program verisi eksik (satışlar programa girilmemiş olabilir). */
export const Z_HEALTH_LIMIT_PERMILLE = 50;
