"use client";

import { formatBusinessDate } from "@/lib/businessDate";
import { formatTRY, formatTRYShort } from "@/lib/money";
import { BarChartCard } from "@/client/components/BarChartCard";

/** Analizler: son 12 haftanın cirosu (KDV dahil). */
export function WeeklyChart({ weeks }: { weeks: { from: string; to: string; revenueGrossKurus: number }[] }) {
  return (
    <BarChartCard
      title="Son 12 hafta ciro (KDV dahil)"
      valueLabel="Ciro"
      data={weeks.map((w) => ({
        label: formatBusinessDate(w.from).slice(0, 5),
        fullLabel: `${formatBusinessDate(w.from)} – ${formatBusinessDate(w.to)}`,
        value: w.revenueGrossKurus,
      }))}
      format={formatTRY}
      axisFormat={formatTRYShort}
      height={220}
    />
  );
}
