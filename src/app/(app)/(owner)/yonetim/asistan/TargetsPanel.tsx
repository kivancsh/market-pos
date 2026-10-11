"use client";

import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { METRIC_INFO, PACE_LABELS, type PaceStatus, type TargetMetric, type TargetProgress } from "@/lib/assistant";
import { divRound, formatPermille, formatTRY, mulDivRound, parseTRYToKurus } from "@/lib/money";

export function fmtMetric(metric: TargetMetric, v: number | null): string {
  if (v === null) return "—";
  const unit = METRIC_INFO[metric].unit;
  return unit === "money" ? formatTRY(v) : unit === "permille" ? formatPermille(v) : v.toLocaleString("tr-TR");
}

export const PACE_STYLE: Record<PaceStatus, string> = {
  ahead: "bg-emerald-100 text-emerald-800",
  on_track: "bg-sky-100 text-sky-800",
  behind: "bg-red-100 text-red-800",
  no_data: "bg-slate-100 text-slate-600",
};

/** Hedef girişini metinden değere çevirir (para: TL, marj: yüzde, adet: tam sayı). */
function parseMetric(metric: TargetMetric, s: string): number | null {
  const unit = METRIC_INFO[metric].unit;
  if (unit === "count") return /^\d{1,9}$/.test(s.trim()) ? Number(s.trim()) : null;
  // Net kâr hedefi zarar eden dükkânda eksi olabilir
  const k = parseTRYToKurus(s.replace("%", "").replace("−", "-"), { allowNegative: metric === "net_profit" });
  if (k === null) return null;
  return unit === "permille" ? divRound(k, 10) : k;
}
function editText(metric: TargetMetric, v: number): string {
  const unit = METRIC_INFO[metric].unit;
  if (unit === "count") return String(v);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (unit === "permille") return `${sign}${Math.floor(a / 10)},${a % 10}`;
  return `${sign}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
}

function Bar({ p }: { p: TargetProgress }) {
  if (p.target <= 0) return null;
  const pct = (v: number) => Math.max(0, Math.min(100, mulDivRound(v, 100, p.target)));
  const lower = METRIC_INFO[p.metric].lowerIsBetter;
  return (
    <div className="relative mt-2 h-2.5 rounded-full bg-slate-100" aria-hidden>
      <div className={`h-2.5 rounded-full ${lower ? (p.actual > p.target ? "bg-red-500" : "bg-sky-500") : p.status === "behind" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct(p.actual)}%` }} />
      {p.expectedToDate !== null && p.expectedToDate > 0 && p.expectedToDate < p.target && (
        <div className="absolute -top-1 h-4.5 w-0.5 bg-slate-700" style={{ left: `${pct(p.expectedToDate)}%` }} title="Bugüne kadar beklenen" />
      )}
    </div>
  );
}

/** Bu ayın hedefleri: gerçekleşen, bugüne kadar beklenen, ay sonu tahmini. Yönetici hedefleri değiştirebilir. */
export function TargetsPanel({
  current,
  onSaved,
}: {
  current: { month: string; label: string; targets: TargetProgress[]; rationale: Record<string, string | null>; sources: Record<string, string> };
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setValues(Object.fromEntries(current.targets.map((t) => [t.metric, editText(t.metric, t.target)])));
    setError(null);
    setEditing(true);
  }

  async function save() {
    const targets: { metric: TargetMetric; target: number }[] = [];
    for (const t of current.targets) {
      const v = parseMetric(t.metric, values[t.metric] ?? "");
      if (v === null) {
        setError(`${METRIC_INFO[t.metric].label}: geçerli bir değer yazın.`);
        return;
      }
      if (v !== t.target) targets.push({ metric: t.metric, target: v });
    }
    if (targets.length === 0) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await api("/api/assistant/targets", { method: "PUT", body: { month: current.month, targets } });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Bu ayın hedefleri" data-testid="assistant-targets">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{current.label} hedefleri ve gidişat</h2>
          <p className="text-sm text-slate-600">
            Hedefler son haftaların satışına ve haftanın günlerine göre gerçekçi hesaplanır. Çizgi: bugüne kadar olması gereken.
          </p>
        </div>
        {current.targets.length > 0 && !editing && (
          <button type="button" onClick={startEdit} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold print:hidden" data-testid="targets-edit">
            Hedefleri düzenle
          </button>
        )}
      </div>
      {current.targets.length === 0 ? (
        <p className="text-sm text-slate-500">Hedef koymak için önce birkaç gün satış verisi gerekiyor.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {current.targets.map((t) => (
            <div key={t.metric} className="rounded-xl border border-slate-200 p-3" data-testid={`target-${t.metric}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">{METRIC_INFO[t.metric].label}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${PACE_STYLE[t.status]}`}>{PACE_LABELS[t.status]}</span>
              </div>
              {editing ? (
                <label className="mt-2 block text-sm">
                  <span className="text-slate-600">Hedef {METRIC_INFO[t.metric].unit === "permille" ? "(%)" : METRIC_INFO[t.metric].unit === "money" ? "(₺)" : "(adet)"}</span>
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-right tabular-nums"
                    inputMode="decimal"
                    value={values[t.metric] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [t.metric]: e.target.value }))}
                    aria-label={`${METRIC_INFO[t.metric].label} hedefi`}
                  />
                </label>
              ) : (
                <>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {fmtMetric(t.metric, t.actual)} <span className="text-sm font-medium text-slate-500">/ {fmtMetric(t.metric, t.target)}</span>
                  </p>
                  <Bar p={t} />
                  <p className="mt-1.5 text-xs text-slate-500">
                    {t.forecast !== null && METRIC_INFO[t.metric].cumulative && !METRIC_INFO[t.metric].lowerIsBetter && <>Ay sonu tahmini: <b>{fmtMetric(t.metric, t.forecast)}</b> · </>}
                    {current.sources[t.metric] === "owner" ? "Sizin hedefiniz" : (current.rationale[t.metric] ?? "")}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50" data-testid="targets-save">
            Kaydet
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">
            Vazgeç
          </button>
          {error && <span className="text-sm font-semibold text-red-700">{error}</span>}
        </div>
      )}
    </section>
  );
}
