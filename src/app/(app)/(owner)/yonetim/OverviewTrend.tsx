"use client";

import { formatBusinessDate } from "@/lib/businessDate";
import { formatTRY, formatTRYShort } from "@/lib/money";
import { BarChartCard } from "@/client/components/BarChartCard";

/** Genel bakış: son 30 günün cirosu (KDV dahil). */
export function OverviewTrend({ data }: { data: { date: string; revenueGrossKurus: number }[] }) {
  return (
    <BarChartCard
      title="Son 30 gün ciro (KDV dahil)"
      valueLabel="Ciro"
      data={data.map((d) => ({ label: formatBusinessDate(d.date).slice(0, 5), fullLabel: formatBusinessDate(d.date), value: d.revenueGrossKurus }))}
      format={formatTRY}
      axisFormat={formatTRYShort}
      height={200}
      emptyText="Son 30 günde satış yok."
    />
  );
}
