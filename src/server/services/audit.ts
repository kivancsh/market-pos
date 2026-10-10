import { getBusinessDate } from "@/lib/businessDate";
import type { Ctx } from "../context";
import { insertAudit } from "../db/repositories/audit";

/** İşlem geçmişi türleri (ekranda Türkçe karşılıklarıyla gösterilir). */
export const AUDIT_ACTIONS = {
  "auth.login": "Giriş",
  "auth.login_failed": "Hatalı giriş denemesi",
  "auth.logout": "Çıkış",
  "user.create": "Kullanıcı eklendi",
  "user.update": "Kullanıcı güncellendi",
  "user.secret": "Şifre/PIN değişti",
  "product.create": "Ürün eklendi",
  "product.update": "Ürün güncellendi",
  "product.price": "Fiyat değişti",
  "product.bulk_price": "Toplu fiyat güncelleme",
  "product.barcode": "Barkod değişikliği",
  "product.import": "Excel'den ürün aktarımı",
  "category": "Kategori değişikliği",
  "sale.void": "Satış iptali",
  "return.create": "İade",
  "purchase.create": "Mal girişi",
  "stock.adjust": "Stok düzeltme",
  "day.close": "Gün kapatıldı",
  "day.reopen": "Gün yeniden açıldı",
  "settings.update": "Ayarlar değişti",
  "backup.create": "Yedek alındı",
  "update.download": "Güncelleme indirildi",
  "update.install": "Güncelleme kuruluyor",
  "expense.create": "Gider eklendi",
  "expense.update": "Gider düzeltildi",
  "expense.delete": "Gider silindi",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** İşlem geçmişine kayıt yazar (çağıranın transaction'ı içinde). */
export function audit(
  ctx: Ctx,
  action: AuditAction,
  summary: string,
  opts: { entityType?: string; entityId?: number; details?: unknown } = {},
): void {
  const now = ctx.now();
  insertAudit(ctx.db, {
    createdAt: now.toISOString(),
    businessDate: getBusinessDate(now),
    userId: ctx.actor?.userId ?? null,
    userName: ctx.actor?.name ?? "Sistem",
    role: ctx.actor?.role ?? null,
    action,
    entityType: opts.entityType ?? null,
    entityId: opts.entityId ?? null,
    summary,
    detailsJson: opts.details === undefined ? null : JSON.stringify(opts.details),
  });
}
