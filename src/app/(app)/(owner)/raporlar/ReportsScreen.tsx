"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBusinessDate, getBusinessDate, presetRange, type RangePreset } from "@/lib/businessDate";
import { formatPermille, formatTRY, formatTRYShort } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import { BarChartCard } from "@/client/components/BarChartCard";
import { Notice } from "@/client/components/Notice";
import type { ReportColumn, ReportKey, ReportResult, ReportRow } from "@/server/services/reports";

const TABS: { key: ReportKey; label: string }[] = [
  { key: "daily", label: "Günlük özet" },
  { key: "cashiers", label: "Kasiyer performansı" },
  { key: "profit-loss", label: "Kâr-zarar" },
  { key: "expenses", label: "Giderler" },
  { key: "products", label: "Ürün kârlılığı" },
  { key: "categories", label: "Kategori kârlılığı" },
  { key: "low-margin", label: "Düşük marjlı" },
  { key: "dead-stock", label: "Satmayanlar (30 gün)" },
  { key: "stock-value", label: "Stok değeri" },
];

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Bugün" },
  { key: "yesterday", label: "Dün" },
  { key: "this_week", label: "Bu hafta" },
  { key: "this_month", label: "Bu ay" },
  { key: "last_month", label: "Geçen ay" },
];

function fmt(col: ReportColumn, v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return col.type === "text" ? "" : "—";
  switch (col.type) {
    case "money":
      return typeof v === "number" ? formatTRY(v) : String(v);
    case "permille":
      return typeof v === "number" ? formatPermille(v) : String(v);
    case "int":
      return typeof v === "number" ? v.toLocaleString("tr-TR") : String(v);
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatBusinessDate(v) : String(v);
    default:
      return String(v);
  }
}

const numeric = (c: ReportColumn) => c.type !== "text" && c.type !== "date";

export function ReportsScreen({ initialTab = "daily" }: { initialTab?: ReportKey }) {
  const today = getBusinessDate();
  const [tab, setTab] = useState<ReportKey>(initialTab);
  const [preset, setPreset] = useState<RangePreset | "custom">("this_month");
  const [range, setRange] = useState(() => presetRange("this_month", today));
  const [data, setData] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const query = `from=${range.from}&to=${range.to}`;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<ReportResult>(`/api/reports/${tab}?${query}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const rows = useMemo(() => {
    if (!data || !sort) return data?.rows ?? [];
    const col = data.columns.find((c) => c.key === sort.key);
    if (!col) return data.rows;
    return [...data.rows].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb), "tr") * sort.dir;
    });
  }, [data, sort]);

  function choosePreset(p: RangePreset) {
    setPreset(p);
    setRange(presetRange(p, today));
  }

  const usesRange = data?.usesRange ?? true;
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Raporlar</h1>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 shadow-sm">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => choosePreset(p.key)}
            aria-pressed={preset === p.key}
            className={`h-10 rounded-lg px-3 font-semibold ${preset === p.key ? "bg-slate-900 text-white" : "bg-slate-100"}`}
          >
            {p.label}
          </button>
        ))}
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Başlangıç
          <input
            type="date"
            value={range.from}
            max={today}
            onChange={(e) => {
              if (!e.target.value) return;
              setPreset("custom");
              setRange((r) => ({ from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }));
            }}
            className="h-10 rounded-lg border border-slate-300 px-2 text-base"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Bitiş
          <input
            type="date"
            value={range.to}
            max={today}
            onChange={(e) => {
              if (!e.target.value) return;
              setPreset("custom");
              setRange((r) => ({ from: r.from > e.target.value ? e.target.value : r.from, to: e.target.value }));
            }}
            className="h-10 rounded-lg border border-slate-300 px-2 text-base"
          />
        </label>
      </div>

      <div className="-mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Rapor türü">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setSort(null);
            }}
            className={`h-11 rounded-xl px-4 font-semibold whitespace-nowrap ${tab === t.key ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {data && (
        <section className="flex flex-col gap-3" aria-busy={loading}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold">{data.title}</h2>
              <p className="text-sm text-slate-600">
                {usesRange ? `${formatBusinessDate(data.from)} – ${formatBusinessDate(data.to)}` : `${formatBusinessDate(data.to)} itibarıyla (tarih aralığından bağımsız)`}
                {" · "}
                {data.description}
              </p>
            </div>
            <a
              href={`/api/reports/${tab}/export?${query}`}
              download
              className="flex h-11 items-center rounded-xl bg-slate-900 px-4 font-bold text-white"
              data-testid="export-excel"
            >
              Excel&apos;e aktar
            </a>
          </div>

          {data.totals && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Toplamlar">
              {data.columns
                .filter((c) => numeric(c) && data.totals![c.key] !== null && data.totals![c.key] !== undefined && data.totals![c.key] !== "")
                .slice(0, 4)
                .map((c) => (
                  <div key={c.key} className="rounded-2xl bg-white p-3 shadow-sm">
                    <div className="text-xs font-medium text-slate-600">{c.label}</div>
                    <div className="text-xl font-extrabold tabular-nums">{fmt(c, data.totals![c.key])}</div>
                  </div>
                ))}
            </div>
          )}

          {tab === "daily" && data.rows.length > 1 && (
            <BarChartCard
              title="Günlük ciro (KDV dahil, iadeler düşülmüş)"
              valueLabel="Ciro"
              format={formatTRY}
              axisFormat={formatTRYShort}
              data={data.rows.map((r) => ({
                label: formatBusinessDate(String(r.businessDate)).slice(0, 5),
                fullLabel: formatBusinessDate(String(r.businessDate)),
                value: Math.max(Number(r.revenueGrossKurus), 0),
              }))}
            />
          )}

          {rows.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              {loading ? "Yükleniyor…" : "Bu rapor için kayıt yok."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm" data-testid="report-table">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    {data.columns.map((c) => {
                      const active = sort?.key === c.key;
                      return (
                        <th
                          key={c.key}
                          className={`px-3 py-2 ${numeric(c) ? "text-right" : ""}`}
                          aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}
                        >
                          <button
                            type="button"
                            onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: numeric(c) ? -1 : 1 }))}
                            className="uppercase"
                          >
                            {c.label} {active ? (sort!.dir === 1 ? "▲" : "▼") : ""}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: ReportRow, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {data.columns.map((c) => {
                        const v = r[c.key];
                        const negative = typeof v === "number" && v < 0 && (c.type === "money" || c.type === "permille");
                        return (
                          <td key={c.key} className={`px-3 py-2 ${numeric(c) ? "text-right tabular-nums" : ""} ${negative ? "text-red-700" : ""}`}>
                            {fmt(c, v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {data.totals && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-bold">
                      {data.columns.map((c) => (
                        <td key={c.key} className={`px-3 py-2 ${numeric(c) ? "text-right tabular-nums" : ""}`}>
                          {fmt(c, data.totals![c.key])}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      )}
      {!data && !error && <p className="py-10 text-center text-slate-500">Yükleniyor…</p>}
    </main>
  );
}
