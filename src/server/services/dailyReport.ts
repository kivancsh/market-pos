/**
 * Günlük rapor e-postası: o günün özeti (ciro, kâr, marj, ödeme türleri, iadeler, en çok satanlar, kritik stok,
 * kasa sayımı) + ekte o günün ürün kârlılığı Excel'i. Aktif ve e-postası olan bütün yöneticilere gider.
 *
 * Ne zaman: "Günü Kapat"ta hemen (trigger "close"); gün kapatılmazsa Ayarlar'daki saatte otomatik ("auto");
 * bilgisayar o saatte kapalıysa sonraki açılışta önceki günün raporu gönderilir. Otomatik gönderim günde bir kez.
 */
import { addDays, formatBusinessDate, getBusinessDate } from "@/lib/businessDate";
import { formatPermille, formatTRY } from "@/lib/money";
import type { Ctx } from "../context";
import { hasDailyReport, insertDailyReportLog, type ReportTrigger } from "../db/repositories/dailyReports";
import { getSettings } from "../db/repositories/settings";
import { listActiveOwnerEmails } from "../db/repositories/users";
import { asciiSlug, reportToXlsx } from "../excel";
import { AppError } from "../errors";
import { isMailConfigured, sendMail } from "../mail";
import { esc, layout } from "../mail/templates";
import { getDashboard } from "./dashboard";
import { buildReport } from "./reports";

export type ReportSendResult =
  | { status: "sent"; recipients: string[] }
  | { status: "skipped"; reason: "not_configured" | "no_recipients" | "disabled" | "no_activity" | "already_sent" }
  | { status: "failed"; message: string };

export async function buildDailyReportEmail(ctx: Ctx, date: string) {
  const d = getDashboard(ctx, date);
  const s = d.summary;
  const businessName = getSettings(ctx.db).businessName;
  const nice = formatBusinessDate(date);
  const row = (k: string, v: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#475569">${esc(k)}</td><td style="padding:6px 0;text-align:right;${strong ? "font-weight:800;font-size:16px" : "font-weight:600"}">${esc(v)}</td></tr>`;
  const closing = d.closing;
  const closingHtml = closing.closed
    ? `<h2 style="font-size:15px;margin:20px 0 6px">Kasa sayımı</h2><table width="100%" style="border-collapse:collapse;font-size:14px">
${row("Kasada olması gereken nakit", formatTRY(closing.expectedCashKurus))}
${closing.countedCashKurus !== null ? row("Sayılan nakit", formatTRY(closing.countedCashKurus)) : ""}
${closing.cashDifferenceKurus !== null ? row(closing.cashDifferenceKurus === 0 ? "Kasa tam" : closing.cashDifferenceKurus > 0 ? "Kasa fazlası" : "Kasa eksiği", formatTRY(Math.abs(closing.cashDifferenceKurus)), true) : ""}
${closing.note ? row("Not", closing.note) : ""}</table>`
    : `<p style="margin:16px 0 0;color:#b45309">Gün henüz kapatılmadı (kasa sayımı yapılmadı).</p>`;
  const list = (title: string, items: string[]) =>
    items.length
      ? `<h2 style="font-size:15px;margin:20px 0 6px">${esc(title)}</h2><ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.6">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`
      : "";
  const top = d.topByQty.map((p) => `${p.name} — ${p.qty} adet, ${formatTRY(p.revenueGrossKurus)}`);
  const critical = [
    ...d.stock.outOfStock.map((p) => `${p.name}: stok bitti`),
    ...d.stock.critical.map((p) => `${p.name}: ${p.stockQty} kaldı (min ${p.minStock})`),
  ];

  const html = layout(
    `Günlük rapor — ${nice}`,
    `<table width="100%" style="border-collapse:collapse;font-size:14px">
${row("Ciro (KDV dahil)", formatTRY(s.revenueGrossKurus), true)}
${row("Ciro (KDV hariç)", formatTRY(s.revenueNetKurus))}
${row("Brüt kâr (KDV hariç)", formatTRY(s.grossProfitKurus), true)}
${row("Kâr marjı", formatPermille(s.marginPermille))}
${row("Satış sayısı", String(s.saleCount))}
${row("Ortalama sepet", s.avgBasketKurus === null ? "—" : formatTRY(s.avgBasketKurus))}
${row("Satılan ürün adedi", String(s.itemsSold))}
${row("Nakit", `${formatTRY(s.cash.salesKurus)} (${s.cash.saleCount} satış)`)}
${row("Kart", `${formatTRY(s.card.salesKurus)} (${s.card.saleCount} satış)`)}
${row("İadeler", `${formatTRY(s.refundsKurus)} (${s.returnCount} iade)`)}
${s.voidedCount ? row("İptal edilen satış", String(s.voidedCount)) : ""}
</table>
${closingHtml}
${list("En çok satan ürünler", top)}
${list("Azalan / biten stok", critical)}
<p style="margin:18px 0 0;font-size:13px;color:#64748b">Ekte: o günün ürün kârlılığı (Excel).</p>`,
    businessName,
  );
  const text = [
    `${businessName} — Günlük rapor (${nice})`,
    `Ciro (KDV dahil): ${formatTRY(s.revenueGrossKurus)}`,
    `Brüt kâr (KDV hariç): ${formatTRY(s.grossProfitKurus)} · Marj: ${formatPermille(s.marginPermille)}`,
    `Satış: ${s.saleCount} · Nakit ${formatTRY(s.cash.salesKurus)} · Kart ${formatTRY(s.card.salesKurus)} · İade ${formatTRY(s.refundsKurus)}`,
    closing.closed && closing.cashDifferenceKurus !== null ? `Kasa farkı: ${formatTRY(closing.cashDifferenceKurus)}` : "Gün henüz kapatılmadı.",
  ].join("\n");
  const report = buildReport(ctx, "products", date, date);
  const xlsx = await reportToXlsx(report, businessName);
  return {
    subject: `${businessName} günlük rapor ${nice}: ciro ${formatTRY(s.revenueGrossKurus)}, kâr ${formatTRY(s.grossProfitKurus)}`,
    text,
    html,
    attachments: [
      {
        filename: `urun-karliligi-${asciiSlug(businessName)}-${date}.xlsx`,
        content: xlsx,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
    hasActivity: s.saleCount + s.returnCount + s.voidedCount > 0 || closing.closed,
  };
}

/** Raporu gönderir. Hata fırlatmaz; sonucu döndürür (gün kapatma gibi işlemleri bozmasın). */
export async function sendDailyReport(ctx: Ctx, date: string, trigger: ReportTrigger): Promise<ReportSendResult> {
  try {
    const settings = getSettings(ctx.db);
    if (trigger === "auto" && !settings.dailyReportEnabled) return { status: "skipped", reason: "disabled" };
    if (!isMailConfigured(ctx.db)) return { status: "skipped", reason: "not_configured" };
    const recipients = listActiveOwnerEmails(ctx.db);
    if (recipients.length === 0) return { status: "skipped", reason: "no_recipients" };
    if (trigger === "auto" && hasDailyReport(ctx.db, date)) return { status: "skipped", reason: "already_sent" };
    const mail = await buildDailyReportEmail(ctx, date);
    if (trigger === "auto" && !mail.hasActivity) return { status: "skipped", reason: "no_activity" };
    await sendMail(ctx.db, { to: recipients, subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments });
    const nowIso = ctx.now().toISOString();
    ctx.db.transaction(() => insertDailyReportLog(ctx.db, date, trigger, recipients, nowIso)).immediate();
    return { status: "sent", recipients };
  } catch (e) {
    console.error("[günlük rapor]", e);
    return { status: "failed", message: e instanceof AppError ? e.message : "Rapor e-postası gönderilemedi." };
  }
}

/** "HH:MM" → dakika. Geçersizse varsayılan 23:30. */
export function parseTime(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 23 * 60 + 30;
}

/** İstanbul saatine göre günün dakikası. */
export function istanbulMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** Otomatik gönderim için sırası gelen günler: bugün (saat geldiyse) ve dün (kaçırıldıysa). */
export function dueReportDates(now: Date, reportTime: string): string[] {
  const today = getBusinessDate(now);
  const dates = [addDays(today, -1)];
  if (istanbulMinutes(now) >= parseTime(reportTime)) dates.push(today);
  return dates;
}

/** Zamanlayıcı her dakika çağırır. */
export async function runScheduledReports(ctx: Ctx): Promise<ReportSendResult[]> {
  const settings = getSettings(ctx.db);
  if (!settings.dailyReportEnabled) return [];
  const out: ReportSendResult[] = [];
  for (const date of dueReportDates(ctx.now(), settings.dailyReportTime)) {
    if (hasDailyReport(ctx.db, date)) continue;
    out.push(await sendDailyReport(ctx, date, "auto"));
  }
  return out;
}
