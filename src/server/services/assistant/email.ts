/** Aylık rapor e-postası (yöneticilere): özet rakamlar, hedefler, yapay zekâ özeti ve aylık aksiyonlar. */
import { METRIC_INFO, PACE_LABELS, monthLabel, shiftMonth, withStaffNames, type TargetProgress } from "@/lib/assistant";
import { formatPermille, formatTRY } from "@/lib/money";
import { esc, layout } from "../../mail/templates";
import type { MonthlyReportView } from "./index";

export function formatMetric(metric: TargetProgress["metric"], v: number | null): string {
  if (v === null) return "—";
  const unit = METRIC_INFO[metric].unit;
  return unit === "money" ? formatTRY(v) : unit === "permille" ? formatPermille(v) : String(v);
}

export function buildMonthlyEmail(v: MonthlyReportView): { subject: string; text: string; html: string } {
  const f = v.facts;
  const k = f.kpi;
  const names = (s: string) => withStaffNames(s, v.aliasNames);
  const row = (a: string, b: string, strong = false) =>
    `<tr><td style="padding:5px 0;color:#475569">${esc(a)}</td><td style="padding:5px 0;text-align:right;${strong ? "font-weight:800;font-size:16px" : "font-weight:600"}">${esc(b)}</td></tr>`;
  const chg = (p: number | null) => (p === null ? "" : ` (${p >= 0 ? "+" : ""}${formatPermille(p)})`);
  const kpis = `<table width="100%" style="border-collapse:collapse;font-size:14px">
${row("Ciro (KDV dahil)", formatTRY(k.revenueGrossKurus) + chg(f.changes.revenue), true)}
${row("Brüt kâr", formatTRY(k.grossProfitKurus) + chg(f.changes.grossProfit), true)}
${row("Kâr marjı", formatPermille(k.marginPermille))}
${row("Giderler (KDV hariç)", formatTRY(k.expensesNetKurus))}
${row("Net kâr", formatTRY(k.netProfitKurus) + chg(f.changes.netProfit), true)}
${row("Satış sayısı", String(k.saleCount) + chg(f.changes.saleCount))}
${row("Ortalama sepet", k.avgBasketKurus === null ? "—" : formatTRY(k.avgBasketKurus))}
</table><p style="margin:4px 0 0;font-size:12px;color:#64748b">Parantez içi: ${esc(monthLabel(f.previous.month))} ayına göre değişim.</p>`;

  const targets = f.targets.length
    ? `<h2 style="font-size:15px;margin:20px 0 6px">Bu ayın hedefleri</h2><table width="100%" style="border-collapse:collapse;font-size:13px">
${f.targets.map((t) => row(`${METRIC_INFO[t.metric].label} — ${PACE_LABELS[t.status]}`, `${formatMetric(t.metric, t.actual)} / ${formatMetric(t.metric, t.target)}`)).join("\n")}</table>`
    : "";
  const next = v.nextTargets.length
    ? `<h2 style="font-size:15px;margin:20px 0 6px">${esc(monthLabel(shiftMonth(v.month, 1)))} hedefleri</h2><table width="100%" style="border-collapse:collapse;font-size:13px">
${v.nextTargets.map((t) => row(METRIC_INFO[t.metric].label, formatMetric(t.metric, t.target))).join("\n")}</table>`
    : "";
  const ai = v.ai
    ? `<div style="margin:18px 0;padding:14px;border-radius:12px;background:#ecfdf5;border:1px solid #a7f3d0">
<p style="margin:0 0 6px;font-weight:800">${esc(names(v.ai.headline))}</p><p style="margin:0;font-size:14px;line-height:1.55">${esc(names(v.ai.summary))}</p></div>`
    : "";
  const actions = `<h2 style="font-size:15px;margin:20px 0 6px">Aylık alınabilecek aksiyonlar</h2>
<ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.55">${v.plan
    .slice(0, 8)
    .map(
      (a) =>
        `<li style="margin-bottom:8px"><b>${esc(names(a.title))}</b>${a.week ? ` <span style="color:#64748b">· ${esc(a.week)}</span>` : ""}<br><span style="color:#475569">${esc(names(a.why))}</span>${a.impact ? `<br><span style="color:#047857;font-weight:600">${esc(a.impact)}</span>` : ""}</li>`,
    )
    .join("")}</ol>`;
  const potential =
    v.potential.maxKurus > 0
      ? `<p style="margin:12px 0 0;font-size:14px">Önerilerin toplam kâr potansiyeli: <b>${esc(formatTRY(v.potential.minKurus))} – ${esc(formatTRY(v.potential.maxKurus))}</b> / ay.</p>`
      : "";
  const html = layout(
    `${f.monthLabel} aylık raporu${f.isPartial ? " (ara rapor)" : ""}`,
    `${ai}${kpis}${targets}${actions}${potential}${next}
<p style="margin:18px 0 0;font-size:13px;color:#64748b">Ayrıntılı analiz, personel değerlendirmesi ve aksiyon takibi: Market Kasa → Yapay zekâ asistanı.</p>`,
    f.businessName,
  );
  const text = [
    `${f.businessName} — ${f.monthLabel} aylık raporu`,
    v.ai ? names(v.ai.headline) : "",
    `Ciro: ${formatTRY(k.revenueGrossKurus)} · Brüt kâr: ${formatTRY(k.grossProfitKurus)} · Net kâr: ${formatTRY(k.netProfitKurus)}`,
    "",
    "Aylık alınabilecek aksiyonlar:",
    ...v.plan.slice(0, 8).map((a, i) => `${i + 1}. ${names(a.title)}${a.impact ? ` (${a.impact})` : ""}`),
  ]
    .filter((l) => l !== "")
    .join("\n");
  return {
    subject: `${f.businessName} ${f.monthLabel} raporu: ciro ${formatTRY(k.revenueGrossKurus)}, net kâr ${formatTRY(k.netProfitKurus)}`,
    text,
    html,
  };
}

