"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BarDatum {
  /** Eksende görünen kısa etiket (ör. "06.10" veya "14"). */
  label: string;
  /** İpucunda görünen tam etiket (ör. "6 Ekim 2026" veya "14:00–15:00"). */
  fullLabel: string;
  value: number;
}

const SERIES = "#2a78d6"; // tek seri: kategorik palet 1. renk (mavi)
const GRID = "#e2e8f0";
const AXIS_TEXT = "#64748b";

/**
 * Tek serilik sütun grafiği. Tek seri olduğu için lejant yok; başlık seriyi adlandırır.
 * Üzerine gelince değer gösterilir; aynı veri "Tablo olarak göster" ile metin olarak da görülebilir.
 */
export function BarChartCard({
  title,
  data,
  format,
  height = 220,
  valueLabel,
}: {
  title: string;
  data: BarDatum[];
  format: (v: number) => string;
  height?: number;
  valueLabel: string;
}) {
  const allZero = data.every((d) => d.value === 0);
  return (
    <figure className="rounded-2xl bg-white p-4 shadow-sm">
      <figcaption className="mb-2 font-semibold text-slate-900">{title}</figcaption>
      {allZero ? (
        <p className="py-10 text-center text-slate-500">Bu dönemde satış yok.</p>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title} grafiği`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} width={56} tickFormatter={(v: number) => format(v)} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.15)" }}
                content={({ active, payload }) => {
                  const d = active && payload?.[0] ? (payload[0].payload as BarDatum) : null;
                  if (!d) return null;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
                      <div className="text-slate-600">{d.fullLabel}</div>
                      <div className="font-semibold text-slate-900">
                        {valueLabel}: {format(d.value)}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" fill={SERIES} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-slate-600">Tablo olarak göster</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Dönem</th>
              <th className="py-1 text-right">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-slate-100">
                <td className="py-1">{d.fullLabel}</td>
                <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
