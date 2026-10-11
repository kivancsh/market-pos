/**
 * Yazar kasa (ÖKC) entegrasyonu: satışın yazar kasada yasal fişe dönüşmesi.
 *
 * Kural (GİB, Hugin FPU dokümanı): fiş işlemi yazar kasada başlar ve yazar kasada biter; tutar ve KDV yazar kasaya
 * değiştirilmeden gider. Akış:
 *   1. Kasada satış tamamlanınca (completeSale, aynı transaction) satış "bekliyor" olarak kuyruğa girer.
 *   2. Yazar kasa siparişi alır (Hugin Cloud Link: GET /orders/{id}) → "yazar kasada açıldı".
 *   3. Ödeme yazar kasada alınır, fiş basılır → "fiş kesildi" (fiş/Z numarası saklanır).
 *   4. Yazar kasa hata verirse kasada "tekrar gönder" ya da "satışı iptal et"; iptalde satış iptal edilir, stok geri eklenir.
 * Satış (ciro, kâr, stok) 1. adımda yazılır; yasal fiş kesilmezse 4. adımda iptal edilerek geri alınır.
 */
import crypto from "node:crypto";
import { formatTRY } from "@/lib/money";
import {
  isDeviceMode,
  isOkcOpen,
  zDifferencePermille,
  Z_HEALTH_LIMIT_PERMILLE,
  type OkcMode,
  type OkcSaleStatus,
} from "@/lib/okc";
import type { Ctx } from "../context";
import {
  countUnprintedForDate,
  getOkcByOrderId,
  getOkcBySale,
  insertOkcDocument,
  listOpenOkcDocuments,
  listUnprintedOkcDocuments,
  markOkcCancelled,
  markOkcFailed,
  markOkcPrinted,
  markOkcSent,
  requeueOkc,
  type OkcDocument,
} from "../db/repositories/okc";
import { getSaleById, getSaleItems } from "../db/repositories/sales";
import { getSettings } from "../db/repositories/settings";
import type { DB } from "../db/types";
import { conflict, forbidden, notFound } from "../errors";
import { decryptSecret, encryptSecret } from "../mail";
import { huginOrderDetail, huginOrderSummary, parseHuginResult, parseHuginSale } from "../okc/hugin";
import { parseInput, z } from "../validation/zod";
import { audit } from "./audit";
import { stamp } from "./clock";
import { voidSale } from "./voids";

export const OKC_CANCEL_REASON = "Yazar kasada fiş kesilmedi";
const HUGIN_KEY = "okc_hugin_key_enc";
const SIM_SEQ = "okc_sim_seq";

export function getOkcMode(db: DB): OkcMode {
  return getSettings(db).okcMode;
}

function statusView(d: OkcDocument): OkcSaleStatus {
  return {
    saleId: d.saleId,
    provider: d.provider,
    orderId: d.orderId,
    status: d.status,
    documentNo: d.documentNo,
    zNo: d.zNo,
    errorMessage: d.errorMessage,
    updatedAt: d.updatedAt,
  };
}

/**
 * completeSale transaction'ı içinde çağrılır: yazar kasa bağlıysa satışı yazar kasa kuyruğuna alır.
 * Bağlı değilse (kapalı / elle) null döner.
 */
export function enqueueSaleForOkc(db: DB, saleId: number, nowIso: string): OkcSaleStatus | null {
  const mode = getOkcMode(db);
  if (!isDeviceMode(mode)) return null;
  insertOkcDocument(db, { saleId, provider: mode, orderId: `MK-${saleId}`, nowIso });
  return statusView(getOkcBySale(db, saleId)!);
}

/** Satışın yazar kasa kaydı varsa durumu, yoksa null. */
export function findSaleOkcStatus(db: DB, saleId: number): OkcSaleStatus | null {
  const d = getOkcBySale(db, saleId);
  return d ? statusView(d) : null;
}

/** Satışın yazar kasa durumu (kasa ekranı bunu fiş kesilene kadar sorar). */
export function getSaleOkcStatus(ctx: Ctx, saleId: number): OkcSaleStatus {
  const d = getOkcBySale(ctx.db, saleId);
  if (!d) throw notFound("OKC_NOT_FOUND", "Bu satış yazar kasaya gönderilmemiş.");
  return statusView(d);
}

function requireOpenOrFailed(db: DB, saleId: number): OkcDocument {
  const d = getOkcBySale(db, saleId);
  if (!d) throw notFound("OKC_NOT_FOUND", "Bu satış yazar kasaya gönderilmemiş.");
  if (d.status === "printed") throw conflict("OKC_ALREADY_PRINTED", "Bu satışın yasal fişi zaten kesildi.");
  if (d.status === "cancelled") throw conflict("OKC_CANCELLED", "Bu satış zaten iptal edildi.");
  return d;
}

/** Hata veren fişi yazar kasaya yeniden gönder. */
export function retrySaleOkc(ctx: Ctx, saleId: number): OkcSaleStatus {
  const time = stamp(ctx);
  return ctx.db
    .transaction((): OkcSaleStatus => {
      const d = requireOpenOrFailed(ctx.db, saleId);
      if (d.status !== "failed") return statusView(d);
      requeueOkc(ctx.db, d.id, time.nowIso);
      audit(ctx, "okc.retry", `Sipariş ${d.orderId} yazar kasaya yeniden gönderildi`, { entityType: "sale", entityId: saleId });
      return statusView(getOkcBySale(ctx.db, saleId)!);
    })
    .immediate();
}

/**
 * Yazar kasa fişi kesmediyse satışı iptal eder (stok geri eklenir, ciroya girmez).
 * Kasiyer de yapabilir: satış yasal fişe dönüşmediği için "satış iptali" yetkisi gerekmez.
 */
export function cancelSaleOkc(ctx: Ctx, saleId: number): OkcSaleStatus {
  const d = requireOpenOrFailed(ctx.db, saleId);
  const sale = getSaleById(ctx.db, saleId);
  if (sale && sale.status === "completed") voidSale(ctx, saleId, { reason: OKC_CANCEL_REASON });
  const time = stamp(ctx);
  ctx.db
    .transaction(() => {
      markOkcCancelled(ctx.db, d.id, time.nowIso);
      audit(ctx, "okc.cancel", `Sipariş ${d.orderId}: ${OKC_CANCEL_REASON}`, { entityType: "sale", entityId: saleId });
    })
    .immediate();
  return statusView(getOkcBySale(ctx.db, saleId)!);
}

// ------------------------------------------------------------------ simülatör (cihazsız deneme / eğitim)
export const simulateSchema = z.object({ outcome: z.enum(["paid", "error"]) }).strict();

export function simulateSaleOkc(ctx: Ctx, saleId: number, input: z.input<typeof simulateSchema>): OkcSaleStatus {
  const { outcome } = parseInput(simulateSchema, input);
  const time = stamp(ctx);
  return ctx.db
    .transaction((): OkcSaleStatus => {
      const d = requireOpenOrFailed(ctx.db, saleId);
      if (d.provider !== "simulator") throw forbidden("OKC_NOT_SIMULATOR", "Bu satış gerçek yazar kasaya gönderildi.");
      if (outcome === "error") {
        markOkcFailed(ctx.db, d.id, { nowIso: time.nowIso, code: "SIM_PAPER_OUT", message: "Kâğıt bitti (simülasyon)", resultJson: null });
        audit(ctx, "okc.failed", `Sipariş ${d.orderId}: Kâğıt bitti (simülasyon)`, { entityType: "sale", entityId: saleId });
      } else {
        const row = ctx.db.prepare("SELECT value FROM settings WHERE key = ?").get(SIM_SEQ) as { value: string } | undefined;
        const seq = Number(row?.value ?? "0") + 1;
        ctx.db
          .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .run(SIM_SEQ, String(seq));
        markOkcPrinted(ctx.db, d.id, {
          nowIso: time.nowIso,
          documentNo: String(seq).padStart(4, "0"),
          zNo: "SIM",
          confirmationCode: null,
          resultJson: JSON.stringify({ simulator: true }),
        });
        audit(ctx, "okc.printed", `Sipariş ${d.orderId}: fiş ${String(seq).padStart(4, "0")} kesildi (simülasyon)`, {
          entityType: "sale",
          entityId: saleId,
        });
      }
      return statusView(getOkcBySale(ctx.db, saleId)!);
    })
    .immediate();
}

// ------------------------------------------------------------------ Hugin Cloud Link
/** Hugin'e bildirilecek bağlantı şifresi (X-ApiKey). Yoksa üretilir. */
export function getHuginApiKey(db: DB): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(HUGIN_KEY) as { value: string } | undefined;
  const plain = row ? decryptSecret(row.value) : null;
  if (plain) return plain;
  return rotateHuginApiKeyRaw(db);
}

function rotateHuginApiKeyRaw(db: DB): string {
  const key = crypto.randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    HUGIN_KEY,
    encryptSecret(key),
  );
  return key;
}

/** Yeni şifre üretir (eskisi geçersiz olur; Hugin'e yenisi bildirilmeli). */
export function rotateHuginApiKey(ctx: Ctx): string {
  return ctx.db
    .transaction((): string => {
      const key = rotateHuginApiKeyRaw(ctx.db);
      audit(ctx, "okc.key", "Hugin bağlantı şifresi yenilendi");
      return key;
    })
    .immediate();
}

export function verifyHuginApiKey(db: DB, provided: string | null): boolean {
  if (!provided || getOkcMode(db) !== "hugin_cloud") return false;
  const expected = Buffer.from(getHuginApiKey(db));
  const got = Buffer.from(provided);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

function receiptFooter(db: DB): string[] {
  return [" **** İYİ GÜNLER ****", ` ${getSettings(db).businessName}`.slice(0, 40)];
}

export function huginListOrders(ctx: Ctx) {
  return listOpenOkcDocuments(ctx.db, "hugin_cloud")
    .map((d) => ({ d, sale: getSaleById(ctx.db, d.saleId) }))
    .filter((x) => x.sale && x.sale.status === "completed")
    .map((x) => huginOrderSummary(x.d.orderId, x.sale!));
}

/** Cihaz siparişi açtı: kalemleri döndürür, durumu "yazar kasada açıldı" yapar. Açık değilse null. */
export function huginGetOrder(ctx: Ctx, orderId: string) {
  const d = getOkcByOrderId(ctx.db, orderId);
  if (!d || d.provider !== "hugin_cloud" || !isOkcOpen(d.status)) return null;
  const sale = getSaleById(ctx.db, d.saleId);
  if (!sale || sale.status !== "completed") return null;
  const time = stamp(ctx);
  ctx.db.transaction(() => markOkcSent(ctx.db, d.id, time.nowIso)).immediate();
  return huginOrderDetail(sale, getSaleItems(ctx.db, sale.id), receiptFooter(ctx.db));
}

/** Cihaz siparişin sonucunu bildirdi (çoğunlukla hata). Sipariş yoksa false. */
export function huginOrderResult(ctx: Ctx, orderId: string, body: unknown): boolean {
  const d = getOkcByOrderId(ctx.db, orderId);
  if (!d || d.provider !== "hugin_cloud") return false;
  const r = parseHuginResult(body);
  const time = stamp(ctx);
  ctx.db
    .transaction(() => {
      if (r.ok) {
        if (d.status !== "printed") {
          markOkcPrinted(ctx.db, d.id, { nowIso: time.nowIso, documentNo: null, zNo: null, confirmationCode: null, resultJson: JSON.stringify(body) });
          audit(ctx, "okc.printed", `Sipariş ${d.orderId}: yazar kasa tamamlandı`, { entityType: "sale", entityId: d.saleId });
        }
      } else if (isOkcOpen(d.status)) {
        markOkcFailed(ctx.db, d.id, { nowIso: time.nowIso, code: r.code, message: r.message, resultJson: JSON.stringify(body) });
        audit(ctx, "okc.failed", `Sipariş ${d.orderId}: ${r.message}`, { entityType: "sale", entityId: d.saleId });
      }
    })
    .immediate();
  return true;
}

/** Cihaz tamamlanan satışı bildirdi: siparişle eşleştirip "fiş kesildi" yapar. Onay kodunu döndürür. */
export function huginSale(ctx: Ctx, body: unknown): { confirmationCode: string; matched: boolean } {
  const p = parseHuginSale(body);
  const confirmationCode = crypto.randomUUID();
  const time = stamp(ctx);
  return ctx.db
    .transaction(() => {
      let d: OkcDocument | undefined;
      if (p.orderId) d = getOkcByOrderId(ctx.db, p.orderId);
      if (!d) {
        const withSale = listUnprintedOkcDocuments(ctx.db, "hugin_cloud").map((x) => ({ x, sale: getSaleById(ctx.db, x.saleId)! }));
        const byTitle = withSale.find(
          (w) => (p.documentTitle && w.sale.receiptNo === p.documentTitle) || (p.orderName && `Fiş ${w.sale.receiptNo}` === p.orderName),
        );
        if (byTitle) d = byTitle.x;
        else if (p.totalKurus !== null) {
          const sent = withSale.filter((w) => w.x.status === "sent" && w.sale.totalKurus === p.totalKurus);
          if (sent.length === 1) d = sent[0]!.x;
        }
      }
      if (!d || d.provider !== "hugin_cloud") {
        audit(ctx, "okc.unmatched", `Yazar kasadan eşleşmeyen satış kaydı geldi${p.totalKurus !== null ? ` (${formatTRY(p.totalKurus)})` : ""}`, {
          details: body,
        });
        return { confirmationCode, matched: false };
      }
      if (d.status !== "printed") {
        markOkcPrinted(ctx.db, d.id, {
          nowIso: time.nowIso,
          documentNo: p.documentNo,
          zNo: p.zNo,
          confirmationCode,
          resultJson: JSON.stringify(body),
        });
        audit(ctx, "okc.printed", `Sipariş ${d.orderId}: yasal fiş kesildi${p.documentNo ? ` (fiş ${p.documentNo})` : ""}`, {
          entityType: "sale",
          entityId: d.saleId,
        });
      }
      return { confirmationCode, matched: true };
    })
    .immediate();
}

// ------------------------------------------------------------------ gün sonu: veri sağlığı
export interface OkcDayHealth {
  mode: OkcMode;
  /** Yasal fişi kesilmemiş (bekleyen / hatalı) satış sayısı */
  unprintedCount: number;
  /** Gün sonunda girilen yazar kasa Z toplamı (KDV dahil) */
  zTotalKurus: number | null;
  /** Programın o günkü satış toplamı (KDV dahil, iptaller hariç, iadeler düşülmeden) */
  appTotalKurus: number;
  /** Fark binde kaç; hesaplanamazsa null */
  differencePermille: number | null;
  /** Fark %5'ten büyük: satışların bir kısmı programa girilmemiş olabilir */
  unhealthy: boolean;
}

export function getOkcDayHealth(db: DB, businessDate: string, appTotalKurus: number, zTotalKurus: number | null): OkcDayHealth {
  const diff = zTotalKurus === null ? null : zDifferencePermille(zTotalKurus, appTotalKurus);
  return {
    mode: getOkcMode(db),
    unprintedCount: countUnprintedForDate(db, businessDate),
    zTotalKurus,
    appTotalKurus,
    differencePermille: diff,
    unhealthy: zTotalKurus !== null && (diff === null || diff > Z_HEALTH_LIMIT_PERMILLE),
  };
}
