"use client";

import { useState } from "react";
import { api, ApiError } from "@/client/api";
import {
  ACTION_STATUS_LABELS,
  ANALYSIS_AREAS,
  ANALYSIS_AREA_LABELS,
  METRIC_INFO,
  PACE_LABELS,
  monthLabel,
  shiftMonth,
  withStaffNames,
  type ActionStatus,
} from "@/lib/assistant";
import { formatBusinessDate, formatIstanbulDateTime } from "@/lib/businessDate";
import { formatPermille, formatTRY } from "@/lib/money";
import type { DisplayAction, MonthlyReportView } from "@/server/services/assistant";
import type { MonthlyFacts } from "@/server/services/assistant/facts";
import { PACE_STYLE, fmtMetric } from "./TargetsPanel";

type Area = (typeof ANALYSIS_AREAS)[number];
const GRADE_STYLE = { iyi: "bg-emerald-100 text-emerald-800", orta: "bg-amber-100 text-amber-800", zayif: "bg-red-100 text-red-800" } as const;
const GRADE_LABEL = { iyi: "İyi", orta: "Orta", zayif: "Zayıf" } as const;
const PRIORITY_STYLE = { yuksek: "bg-red-100 text-red-800", orta: "bg-amber-100 text-amber-800", dusuk: "bg-slate-100 text-slate-700" } as const;

/** Varsayılan açık analiz kartları: en çok para etkisi olanlar. */
const OPEN_AREAS = new Set<Area>(["ciro", "kar", "fiyat", "stok"]);
const tenths = (v: number | null) => (v === null ? "—" : `${Math.floor(v / 10)},${v % 10}`);
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

function Change({ v, points = false }: { v: number | null; points?: boolean }) {
  if (v === null) return <span className="text-slate-400">—</span>;
  const cls = v > 0 ? "text-emerald-700" : v < 0 ? "text-red-700" : "text-slate-500";
  const text = points ? `${v >= 0 ? "+" : "−"}${formatPermille(Math.abs(v)).slice(1)} puan` : `${v >= 0 ? "+" : ""}${formatPermille(v)}`;
  return <span className={`font-semibold ${cls}`}>{text}</span>;
}

function Table({ head, rows, testId, narrow = false }: { head: string[]; rows: (string | number | React.ReactNode)[][]; testId?: string; narrow?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${narrow ? "" : "min-w-[480px]"}`} data-testid={testId}>
        <thead>
          <tr className="text-right text-xs text-slate-500">
            {head.map((h, i) => (
              <th key={i} className={`py-1.5 font-medium ${i === 0 ? "text-left" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 text-right tabular-nums">
              {r.map((c, j) => (
                <td key={j} className={`py-1.5 ${j === 0 ? "text-left" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, change, points }: { label: string; value: string; change?: number | null; points?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {change !== undefined && (
        <p className="text-xs">
          <Change v={change} points={points} /> <span className="text-slate-500">önceki aya göre</span>
        </p>
      )}
    </div>
  );
}

/** Her analiz alanının rakam tablosu. */
function AreaData({ area, f }: { area: Area; f: MonthlyFacts }) {
  const k = f.kpi;
  const p = f.previous.kpi;
  switch (area) {
    case "ciro":
      return (
        <Table
          head={["", f.monthLabel, monthLabel(f.previous.month), ...(f.lastYear ? [monthLabel(f.lastYear.month)] : [])]}
          rows={[
            ["Ciro (KDV dahil)", formatTRY(k.revenueGrossKurus), formatTRY(p.revenueGrossKurus), ...(f.lastYear ? [formatTRY(f.lastYear.kpi.revenueGrossKurus)] : [])],
            ["Satış (fiş) sayısı", k.saleCount, p.saleCount, ...(f.lastYear ? [f.lastYear.kpi.saleCount] : [])],
            ["Ortalama sepet", k.avgBasketKurus === null ? "—" : formatTRY(k.avgBasketKurus), p.avgBasketKurus === null ? "—" : formatTRY(p.avgBasketKurus), ...(f.lastYear ? [f.lastYear.kpi.avgBasketKurus === null ? "—" : formatTRY(f.lastYear.kpi.avgBasketKurus)] : [])],
            ["Satış yapılan gün", k.sellingDays, p.sellingDays, ...(f.lastYear ? [f.lastYear.kpi.sellingDays] : [])],
            ["Günlük ortalama ciro", k.avgDailyRevenueKurus === null ? "—" : formatTRY(k.avgDailyRevenueKurus), p.avgDailyRevenueKurus === null ? "—" : formatTRY(p.avgDailyRevenueKurus), ...(f.lastYear ? ["—"] : [])],
            ["Nakit payı", formatPermille(k.cashSharePermille), formatPermille(p.cashSharePermille), ...(f.lastYear ? ["—"] : [])],
          ]}
        />
      );
    case "kar":
      return (
        <Table
          head={["Ay", "Ciro", "Brüt kâr", "Marj", "Giderler", "Net kâr"]}
          rows={[...f.trend].reverse().map((t) => [monthLabel(t.month), formatTRY(t.revenueGrossKurus), formatTRY(t.grossProfitKurus), formatPermille(t.marginPermille), formatTRY(t.expensesNetKurus), formatTRY(t.netProfitKurus)])}
        />
      );
    case "urun":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            {f.products.soldCount} ürün satıldı ({f.products.activeCount} aktif ürün). Cironun %80’ini {f.abc.find((a) => a.cls === "A")?.count ?? 0} ürün getiriyor.
          </p>
          <Table head={["En kârlı ürünler", "Adet", "Ciro", "Brüt kâr", "Marj"]} rows={f.products.topProfit.slice(0, 8).map((l) => [l.name, l.qty, formatTRY(l.revenueGrossKurus), formatTRY(l.grossProfitKurus), formatPermille(l.marginPermille)])} testId="facts-top-products" />
          <Table head={["Yükselenler", "Önceki ay", "Bu ay"]} rows={f.products.risers.map((l) => [l.name, l.prevQty, l.qty])} />
          <Table head={["Düşenler", "Önceki ay", "Bu ay"]} rows={f.products.fallers.map((l) => [l.name, l.prevQty, l.qty])} />
        </div>
      );
    case "kategori":
      return (
        <Table
          head={["Kategori", "Ciro", "Pay", "Brüt kâr", "Marj", "Değişim"]}
          rows={f.categories.map((c) => [c.name, formatTRY(c.revenueGrossKurus), formatPermille(c.sharePermille), formatTRY(c.grossProfitKurus), formatPermille(c.marginPermille), <Change key="c" v={c.changePermille} />])}
        />
      );
    case "fiyat": {
      const lines = [
        ...f.products.negativeMargin.map((l) => ({ ...l, tag: "Zararına" })),
        ...f.products.erosion.map((l) => ({ ...l, tag: "Maliyet arttı" })),
        ...f.products.lowMarginStars.map((l) => ({ ...l, tag: "Düşük marjlı çok satan" })),
      ];
      return lines.length ? (
        <Table
          head={["Ürün", "Durum", "Alış", "Fiyat", "Önerilen", "Aylık ek kâr"]}
          rows={lines.map((l) => [l.name, l.tag, formatTRY(l.avgCostKurus), formatTRY(l.priceKurus), <b key="s">{formatTRY(l.suggestedPriceKurus)}</b>, formatTRY(l.monthlyGainKurus)])}
          testId="facts-prices"
        />
      ) : (
        <p className="text-sm text-slate-600">Fiyatı güncellenmesi gereken ürün görünmüyor.</p>
      );
    }
    case "stok":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            Stok değeri (alış fiyatıyla) <b>{formatTRY(f.stock.valueAtCostKurus)}</b>
            {f.stock.daysOfInventory !== null && <> · yaklaşık {f.stock.daysOfInventory} günlük satışa yeter</>} · bu ay {f.stock.purchases.count} mal girişi (
            {formatTRY(f.stock.purchases.totalKurus)}) · önerilen sipariş tutarı {formatTRY(f.stock.reorderCostKurus)}.
          </p>
          <Table head={["Stokta yok", "Günlük satış", "Haftalık kaçan kâr"]} rows={f.stock.outOfStock.map((o) => [o.name, tenths(o.dailyAvgTenths), formatTRY(o.lostProfitPerWeekKurus)])} />
          <Table head={["1 hafta içinde biter", "Stok", "Yeter (gün)", "Sipariş"]} rows={f.stock.urgent.map((u) => [u.name, u.stockQty, u.daysCover ?? "—", u.suggestQty])} />
          <Table head={[`30 gündür satılmayan (${f.stock.dead.count})`, "Stok", "Değeri"]} rows={f.stock.dead.items.map((d) => [d.name, d.stockQty, formatTRY(d.valueAtCostKurus)])} />
        </div>
      );
    case "gider":
      return f.expenses.byCategory.length ? (
        <Table
          head={["Gider (KDV hariç)", f.monthLabel, monthLabel(f.previous.month), "3 ay ort."]}
          rows={[
            ...f.expenses.byCategory.map((c) => [c.label, formatTRY(c.netKurus), formatTRY(c.prevNetKurus), c.avg3NetKurus === null ? "—" : formatTRY(c.avg3NetKurus)]),
            [<b key="t">Toplam</b>, <b key="a">{formatTRY(f.expenses.totalNetKurus)}</b>, formatTRY(f.expenses.previousNetKurus), f.expenses.avg3NetKurus === null ? "—" : formatTRY(f.expenses.avg3NetKurus)],
          ]}
        />
      ) : (
        <p className="text-sm text-slate-600">Bu ay gider girilmemiş.</p>
      );
    case "zaman":
      return (
        <div className="flex flex-col gap-3">
          <Table head={["Gün", "Ciro", "Pay", "Günlük ort.", "Satış"]} rows={f.time.weekdays.map((d) => [d.day, formatTRY(d.revenueGrossKurus), formatPermille(d.sharePermille), d.avgPerDayKurus === null ? "—" : formatTRY(d.avgPerDayKurus), d.saleCount])} />
          <div className="flex flex-wrap gap-1" aria-label="Saatlere göre satış payı">
            {f.time.hours.map((h) => (
              <span key={h.hour} className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${f.time.peakHours.includes(h.hour) ? "bg-emerald-600 text-white" : f.time.quietHours.includes(h.hour) ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-900"}`}>
                {hour(h.hour)} · {formatPermille(h.sharePermille)}
              </span>
            ))}
          </div>
        </div>
      );
    case "sepet":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-600">
            Fiş başına ortalama {tenths(f.basket.avgItemsTenths)} ürün · ortalama sepet {k.avgBasketKurus === null ? "—" : formatTRY(k.avgBasketKurus)} · indirim oranı {formatPermille(k.discountRatePermille)}.
          </p>
          <Table head={["Birlikte alınan ürünler", "Fiş sayısı", "Beklenenin katı"]} rows={f.basket.pairs.map((p) => [`${p.a} + ${p.b}`, p.together, `${Math.floor(p.liftHundredths / 100)},${String(p.liftHundredths % 100).padStart(2, "0")}`])} />
        </div>
      );
    case "iade":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-600">
            {k.returnCount} iade ({formatTRY(k.refundsKurus)}, satışların {formatPermille(f.returns.ratePermille)}’i) · {k.voidedCount} satış iptali.
          </p>
          <Table head={["En çok iade edilen", "Satılan", "İade", "Oran"]} rows={f.returns.topProducts.map((r) => [r.name, r.soldQty, r.returnedQty, formatPermille(r.ratePermille)])} />
        </div>
      );
    case "kasa":
      return (
        <p className="text-sm text-slate-600">
          {f.cash.closedDays} gün kapatıldı, {f.cash.countedDays} gün kasa sayıldı. Eksik: {f.cash.shortageDays} gün ({formatTRY(f.cash.shortageKurus)}) · fazla: {f.cash.excessDays} gün (
          {formatTRY(f.cash.excessKurus)}) · kapatılmayan satış günü: {f.cash.daysWithSalesNotClosed}.
          {f.cash.okcDays > 0 && (
            <>
              {" "}
              Yazar kasa Z toplamı {formatTRY(f.cash.okcZTotalKurus)}, program {formatTRY(f.cash.okcExpectedKurus)} (fark {formatPermille(f.cash.okcDiffPermille)}).
            </>
          )}
        </p>
      );
    default:
      return null;
  }
}

function ActionCard({ a, n, month, names, onChange }: { a: DisplayAction; n: number; month: string; names: (s: string) => string; onChange: (plan: DisplayAction[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function set(status: ActionStatus) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ plan: DisplayAction[] }>("/api/assistant/actions", { method: "PUT", body: { month, key: a.key, status } });
      onChange(r.plan);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={`rounded-xl border p-3 ${a.status === "done" ? "border-emerald-300 bg-emerald-50" : a.status === "skipped" ? "border-slate-200 bg-slate-50 opacity-70" : "border-slate-200"}`} data-testid="plan-action">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-bold">
          <span className="mr-1 text-slate-400">{n}.</span>
          {names(a.title)}
        </p>
        <div className="flex flex-wrap gap-1 text-xs font-bold">
          <span className={`rounded-full px-2 py-0.5 ${PRIORITY_STYLE[a.priority]}`}>{a.priorityLabel} öncelik</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{a.areaLabel}</span>
          {a.week && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">{a.week}</span>}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-700">{names(a.why)}</p>
      {a.steps.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
          {a.steps.map((s, i) => (
            <li key={i}>{names(s)}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          {a.impact && <p className="font-semibold text-emerald-800">Beklenen etki: {a.impact}</p>}
          <p className="text-xs text-slate-500">Nasıl ölçülür: {names(a.measure)}</p>
        </div>
        <div className="flex gap-1 print:hidden" role="group" aria-label="Aksiyon durumu">
          {(["done", "skipped", "open"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              aria-pressed={a.status === s}
              onClick={() => void set(s)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${a.status === s ? (s === "done" ? "bg-emerald-600 text-white" : "bg-slate-700 text-white") : "border border-slate-300 bg-white"}`}
              data-testid={`plan-action-${s}`}
            >
              {ACTION_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-1 text-sm font-semibold text-red-700">{error}</p>}
    </li>
  );
}

function Section({ title, id, children, testId }: { title: string; id?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section id={id} className="rounded-2xl bg-white p-4 shadow-sm print:break-inside-avoid print:shadow-none" aria-label={title} data-testid={testId}>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Seçili ayın raporu: kalem kalem analiz → personel → hedefler → özet → aylık alınabilecek aksiyonlar. */
export function ReportView({ report, onPlanChange }: { report: MonthlyReportView; onPlanChange: (plan: DisplayAction[]) => void }) {
  const f = report.facts;
  const k = f.kpi;
  const ai = report.ai;
  const names = (s: string) => withStaffNames(s, report.aliasNames);
  const grade = new Map(ai?.scorecard.map((s) => [s.area, s]) ?? []);
  const aiSection = new Map(ai?.sections.map((s) => [s.area, s]) ?? []);
  const staffAi = new Map(ai?.staff.map((s) => [s.alias, s]) ?? []);
  const done = report.plan.filter((p) => p.status === "done").length;
  const localSummary = [
    `${f.monthLabel}${f.isPartial ? ` (${f.elapsedDays}/${f.daysInMonth} gün)` : ""} cirosu ${formatTRY(k.revenueGrossKurus)}${f.changes.revenue !== null ? ` (önceki aya göre ${f.changes.revenue >= 0 ? "+" : ""}${formatPermille(f.changes.revenue)})` : ""}.`,
    `Brüt kâr ${formatTRY(k.grossProfitKurus)}, marj ${formatPermille(k.marginPermille)}; giderler düşüldükten sonra net kâr ${formatTRY(k.netProfitKurus)}.`,
    f.products.topProfit[0] ? `En çok kazandıran ürün ${f.products.topProfit[0].name} (${formatTRY(f.products.topProfit[0].grossProfitKurus)} brüt kâr).` : "",
    report.potential.maxKurus > 0 ? `Aşağıdaki önerilerle aylık ${formatTRY(report.potential.minKurus)} – ${formatTRY(report.potential.maxKurus)} ek kâr potansiyeli var.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-4" data-testid="assistant-report">
      {/* Başlık ve temel rakamlar */}
      <section className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-5 text-white shadow-sm print:bg-none print:text-black">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-200 print:text-slate-500">
          {f.monthLabel} {f.isPartial ? `ara raporu · ${formatBusinessDate(f.to)} itibarıyla` : "aylık raporu"}
        </p>
        <h2 className="mt-1 text-xl font-bold sm:text-2xl" data-testid="assistant-headline">
          {ai ? names(ai.headline) : `Ciro ${formatTRY(k.revenueGrossKurus)}, net kâr ${formatTRY(k.netProfitKurus)}`}
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2 text-slate-900 sm:grid-cols-4">
          <Kpi label="Ciro (KDV dahil)" value={formatTRY(k.revenueGrossKurus)} change={f.changes.revenue} />
          <Kpi label="Brüt kâr" value={formatTRY(k.grossProfitKurus)} change={f.changes.grossProfit} />
          <Kpi label="Kâr marjı" value={formatPermille(k.marginPermille)} change={f.changes.margin} points />
          <Kpi label="Net kâr (giderler sonrası)" value={formatTRY(k.netProfitKurus)} change={f.changes.netProfit} />
          <Kpi label="Satış sayısı" value={k.saleCount.toLocaleString("tr-TR")} change={f.changes.saleCount} />
          <Kpi label="Ortalama sepet" value={k.avgBasketKurus === null ? "—" : formatTRY(k.avgBasketKurus)} change={f.changes.avgBasket} />
          <Kpi label="Giderler (KDV hariç)" value={formatTRY(k.expensesNetKurus)} />
          <Kpi label="Kâr potansiyeli / ay" value={report.potential.maxKurus > 0 ? `${formatTRY(report.potential.minKurus)}+` : "—"} />
        </div>
        <a href="#aksiyonlar" className="mt-3 inline-block text-sm font-semibold text-emerald-100 underline print:hidden">
          Aylık alınabilecek aksiyonlara git ↓
        </a>
      </section>

      {report.aiError && report.aiSource === "local" && (
        <p className="text-xs text-slate-500 print:hidden" data-testid="assistant-ai-error">
          Bulut yapay zekâ yorumu alınamadı ({report.aiError}); yerleşik asistanın yorumu gösteriliyor.
        </p>
      )}
      {f.dataQuality.notes.length > 0 && (
        <ul className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          {f.dataQuality.notes.map((n) => (
            <li key={n}>ℹ️ {n}</li>
          ))}
        </ul>
      )}

      {/* Kalem kalem analiz */}
      <Section title="İşletmenin kalem kalem analizi" testId="assistant-analysis">
        <div className="flex flex-col gap-2">
          {ANALYSIS_AREAS.filter((a) => a !== "personel").map((area) => {
            const g = grade.get(area);
            const s = aiSection.get(area);
            return (
              <details key={area} open={OPEN_AREAS.has(area)} className="group rounded-xl border border-slate-200 p-3" data-testid={`area-${area}`}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{s?.title ? names(s.title) : ANALYSIS_AREA_LABELS[area]}</span>
                  <span className="flex items-center gap-2 text-sm">
                    {g && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_STYLE[g.grade]}`}>{GRADE_LABEL[g.grade]}</span>}
                    <span className="text-slate-400 group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                  </span>
                </summary>
                <div className="mt-2 flex flex-col gap-3">
                  {g && <p className="text-sm text-slate-700">{names(g.comment)}</p>}
                  {s && (
                    <div className="rounded-lg bg-emerald-50/70 p-3 text-sm">
                      <ul className="list-disc pl-5">
                        {s.findings.map((x, j) => (
                          <li key={j}>{names(x)}</li>
                        ))}
                      </ul>
                      <p className="mt-1 font-semibold text-emerald-900">Fırsat: {names(s.opportunity)}</p>
                    </div>
                  )}
                  <AreaData area={area} f={f} />
                </div>
              </details>
            );
          })}
        </div>
      </Section>

      {/* Personel */}
      <Section title="Personel analizi" testId="assistant-staff">
        {ai?.staffSummary && <p className="mb-3 text-sm text-slate-700">{names(ai.staffSummary)}</p>}
        {f.staff.members.length === 0 ? (
          <p className="text-sm text-slate-500">Bu ay satış yapan kullanıcı yok.</p>
        ) : (
          <>
            <Table
              head={["Kişi", "Satış", "Ciro", "Pay", "Ort. sepet", "Ürün/fiş", "İptal", "İndirim", "Saatlik satış"]}
              rows={f.staff.members.map((m) => [
                names(m.alias),
                m.saleCount,
                formatTRY(m.salesTotalKurus),
                formatPermille(m.sharePermille),
                m.avgBasketKurus === null ? "—" : formatTRY(m.avgBasketKurus),
                tenths(m.itemsPerSaleTenths),
                `${m.voidCount} (${formatPermille(m.voidRatePermille)})`,
                formatPermille(m.discountRatePermille),
                m.salesPerHourKurus === null ? "—" : formatTRY(m.salesPerHourKurus),
              ])}
              testId="staff-table"
            />
            <p className="mt-1 text-xs text-slate-500">
              Ekip ortalaması: sepet {f.staff.team.avgBasketKurus === null ? "—" : formatTRY(f.staff.team.avgBasketKurus)}, iptal oranı {formatPermille(f.staff.team.voidRatePermille)}, indirim{" "}
              {formatPermille(f.staff.team.discountRatePermille)}. Saatlik satış: ilk ve son satış arasında geçen süreye göre.
            </p>
            {staffAi.size > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {f.staff.members
                  .filter((m) => staffAi.has(m.alias))
                  .map((m) => {
                    const s = staffAi.get(m.alias)!;
                    return (
                      <div key={m.alias} className="rounded-xl border border-slate-200 p-3 text-sm">
                        <p className="font-bold">{names(m.alias)}</p>
                        <p className="mt-1 text-slate-700">{names(s.assessment)}</p>
                        {s.strengths.length > 0 && <p className="mt-1 text-emerald-800">✓ {s.strengths.map(names).join(" · ")}</p>}
                        {s.improve.length > 0 && <p className="mt-1 text-amber-800">↗ {s.improve.map(names).join(" · ")}</p>}
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </Section>

      {/* Hedefler */}
      <Section title="Hedefler" testId="assistant-report-targets">
        {ai?.targetsComment && <p className="mb-3 text-sm text-slate-700">{names(ai.targetsComment)}</p>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 font-semibold">{f.monthLabel}: hedef ve gerçekleşen</h3>
            {f.targets.length ? (
              <Table
                narrow
                head={["Hedef", "Gerçekleşen", "Hedef", "Durum"]}
                rows={f.targets.map((t) => [METRIC_INFO[t.metric].label, fmtMetric(t.metric, t.actual), fmtMetric(t.metric, t.target), <span key="s" className={`rounded-full px-2 py-0.5 text-xs font-bold ${PACE_STYLE[t.status]}`}>{PACE_LABELS[t.status]}</span>])}
              />
            ) : (
              <p className="text-sm text-slate-500">Bu ay için hedef konmamıştı.</p>
            )}
          </div>
          <div>
            <h3 className="mb-1 font-semibold">{monthLabel(shiftMonth(report.month, 1))} için önerilen hedefler</h3>
            {report.nextTargets.length ? (
              <Table narrow head={["Hedef", "Taban", "Hedef"]} rows={report.nextTargets.map((t) => [METRIC_INFO[t.metric].label, fmtMetric(t.metric, t.baseline), <b key="t">{fmtMetric(t.metric, t.target)}</b>])} testId="next-targets" />
            ) : (
              <p className="text-sm text-slate-500">{f.isPartial ? "Ay bitince gelecek ayın hedefleri hesaplanır." : "Yeterli veri yok."}</p>
            )}
            {report.nextTargets[0] && <p className="mt-1 text-xs text-slate-500">{report.nextTargets[0].rationale}</p>}
          </div>
        </div>
      </Section>

      {f.priorActions && f.priorActions.items.length > 0 && (
        <Section title={`${monthLabel(f.priorActions.month)} aksiyonları ne oldu?`}>
          <ul className="flex flex-col gap-1 text-sm">
            {f.priorActions.items.map((p) => (
              <li key={p.key} className="flex justify-between gap-2">
                <span>{names(p.title)}</span>
                <span className={`shrink-0 font-semibold ${p.status === "done" ? "text-emerald-700" : p.status === "skipped" ? "text-slate-500" : "text-amber-700"}`}>{ACTION_STATUS_LABELS[p.status]}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Özet */}
      <Section title="Özet" testId="assistant-summary">
        <p className="leading-relaxed text-slate-800">{ai ? names(ai.summary) : localSummary}</p>
        {ai && ai.risks.length > 0 && (
          <div className="mt-3">
            <h3 className="font-semibold">Dikkat edilecek riskler</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
              {ai.risks.map((r, i) => (
                <li key={i}>{names(r)}</li>
              ))}
            </ul>
          </div>
        )}
        {ai?.nextMonthFocus && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-900">Gelecek ayın odağı: {names(ai.nextMonthFocus)}</p>
        )}
      </Section>

      {/* Aylık alınabilecek aksiyonlar */}
      <Section title="Aylık alınabilecek aksiyonlar" id="aksiyonlar" testId="assistant-plan">
        <p className="mb-3 text-sm text-slate-600">
          {report.plan.length} aksiyon · {done} tanesi yapıldı.
          {report.potential.maxKurus > 0 && (
            <>
              {" "}
              Kâr getiren önerilerin toplam etkisi: <b>{formatTRY(report.potential.minKurus)} – {formatTRY(report.potential.maxKurus)}</b> / ay.
            </>
          )}{" "}
          Yaptıklarınızı işaretleyin; gelecek ayın raporu sonuçlarını değerlendirir.
        </p>
        {report.plan.length === 0 ? (
          <p className="text-sm text-slate-500">Bu ay için öneri çıkmadı.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {report.plan.map((a, i) => (
              <ActionCard key={a.key} a={a} n={i + 1} month={report.month} names={names} onChange={onPlanChange} />
            ))}
          </ol>
        )}
      </Section>

      <p className="text-xs text-slate-500">
        Rapor {formatIstanbulDateTime(report.updatedAt)} tarihinde hazırlandı · {formatBusinessDate(f.from)} – {formatBusinessDate(f.to)}
        {report.aiSource === "cloud" ? ` · yorum: bulut yapay zekâ (${report.aiModel})` : " · yorum: Market Kasa yerleşik asistanı (bu bilgisayarda)"}
        {report.emailedAt ? ` · e-postayla gönderildi` : ""}. Rakamlar programdaki kayıtlardan hesaplanır; asistan yalnızca yorumlar.
      </p>
    </div>
  );
}
