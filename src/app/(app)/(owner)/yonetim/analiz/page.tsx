import Link from "next/link";
import { formatBusinessDate } from "@/lib/businessDate";
import { formatPermille, formatTRY } from "@/lib/money";
import { requirePageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { COVER_TARGET_DAYS, STOCK_STATUS_LABEL, formatDailyAvg, getAnalytics, type AnalysisWindow, type StockStatus } from "@/server/services/analytics";
import { WeeklyChart } from "./WeeklyChart";

export const metadata = { title: "Analizler · Optiva" };

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const STATUS_STYLE: Record<StockStatus, string> = {
  bitti: "bg-red-100 text-red-800",
  acil: "bg-orange-100 text-orange-800",
  yakinda: "bg-amber-100 text-amber-800",
  yeterli: "bg-emerald-100 text-emerald-800",
  hareketsiz: "bg-slate-100 text-slate-600",
};

function Section({ title, desc, children, right }: { title: string; desc?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {desc && <p className="text-sm text-slate-600">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default async function AnalyticsPage(props: PageProps<"/yonetim/analiz">) {
  await requirePageUser("owner");
  const sp = await props.searchParams;
  const days: AnalysisWindow = sp.gun === "90" ? 90 : 30;
  const a = getAnalytics({ db: getDb(), now: () => new Date() }, days);
  const maxCell = Math.max(1, ...a.heat.flat().map((c) => c.saleCount));
  const needOrder = a.stock.filter((s) => s.suggestQty > 0 || s.status === "bitti" || s.status === "acil");
  const counts = a.stock.reduce((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {} as Partial<Record<StockStatus, number>>);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analizler</h1>
          <p className="text-slate-600">
            {formatBusinessDate(a.from)} – {formatBusinessDate(a.to)} · ne zaman satıyorsunuz, ne kazandırıyor, ne bitmek üzere
          </p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-white p-1 shadow-sm" aria-label="Dönem">
          {([30, 90] as const).map((d) => (
            <Link
              key={d}
              href={d === 30 ? "/yonetim/analiz" : "/yonetim/analiz?gun=90"}
              aria-current={d === days ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${d === days ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              Son {d} gün
            </Link>
          ))}
        </nav>
      </div>

      <WeeklyChart weeks={a.weeks} />

      <Section
        title="Stok yeterliliği ve sipariş önerisi"
        desc={`Son 30 günün satış hızına göre stok kaç gün yeter; ${COVER_TARGET_DAYS} gün yetecek kadar önerilen alım.`}
        right={
          <div className="flex gap-2">
            <Link href="/raporlar?rapor=reorder" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">
              Sipariş listesi (Excel)
            </Link>
            <Link href="/mal-girisi" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
              Mal girişi
            </Link>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {(["bitti", "acil", "yakinda", "yeterli", "hareketsiz"] as const).map((s) => (
            <span key={s} className={`rounded-full px-3 py-1 font-medium ${STATUS_STYLE[s]}`}>
              {STOCK_STATUS_LABEL[s]}: {counts[s] ?? 0}
            </span>
          ))}
        </div>
        {needOrder.length === 0 ? (
          <p className="text-sm text-slate-500">Şu an sipariş gerektiren ürün yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm" data-testid="stock-plan">
              <thead>
                <tr className="text-right text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Ürün</th>
                  <th className="py-2 text-left font-medium">Durum</th>
                  <th className="py-2 font-medium">Stok</th>
                  <th className="py-2 font-medium">Günlük satış</th>
                  <th className="py-2 font-medium">Kaç gün yeter</th>
                  <th className="py-2 font-medium">Önerilen alım</th>
                  <th className="py-2 font-medium">Tahmini maliyet</th>
                </tr>
              </thead>
              <tbody>
                {needOrder.slice(0, 20).map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 text-right">
                    <td className="py-2 text-left">
                      <Link href={`/urunler/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="py-2 text-left">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status]}`}>{STOCK_STATUS_LABEL[s.status]}</span>
                    </td>
                    <td className="py-2 tabular-nums">{s.stockQty}</td>
                    <td className="py-2 tabular-nums">{formatDailyAvg(s.dailyAvgTenths)}</td>
                    <td className="py-2 tabular-nums">{s.daysCover ?? "—"}</td>
                    <td className="py-2 font-semibold tabular-nums">{s.suggestQty}</td>
                    <td className="py-2 tabular-nums">{formatTRY(s.suggestCostKurus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {needOrder.length > 20 && <p className="mt-2 text-xs text-slate-500">ve {needOrder.length - 20} ürün daha (Excel listesinde tamamı).</p>}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Yoğun saatler" desc={`Son ${days} günde gün ve saate göre satış sayısı (koyu = yoğun).`}>
          {a.hours.length === 0 ? (
            <p className="text-sm text-slate-500">Bu dönemde satış yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs" data-testid="heatmap">
                <thead>
                  <tr>
                    <th />
                    {a.hours.map((h) => (
                      <th key={h} className="px-0.5 pb-1 font-medium text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.heat.map((row, d) => (
                    <tr key={DAYS[d]}>
                      <th className="pr-2 text-left font-medium text-slate-600">{DAYS[d]}</th>
                      {a.hours.map((h) => {
                        const c = row[h]!;
                        const level = c.saleCount === 0 ? 0 : Math.ceil((c.saleCount * 4) / maxCell);
                        const bg = ["#f1f5f9", "#d1fae5", "#6ee7b7", "#10b981", "#047857"][level];
                        return (
                          <td key={h} className="p-0.5">
                            <div
                              title={`${DAYS[d]} ${h}:00–${h + 1}:00 · ${c.saleCount} satış · ${formatTRY(c.totalKurus)}`}
                              className="h-6 w-6 rounded"
                              style={{ background: bg }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="ABC analizi" desc={`Son ${days} günde cironun %80'ini getiren ürünler A, sonraki %15'i B, kalanı C.`}>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center" data-testid="abc-summary">
            {a.abcSummary.map((c) => (
              <div key={c.cls} className="rounded-xl bg-slate-50 p-2">
                <p className="text-xl font-bold">{c.cls}</p>
                <p className="text-xs text-slate-600">
                  {c.count} ürün · cironun {formatPermille(c.sharePermille)}
                </p>
              </div>
            ))}
          </div>
          {a.abc.length === 0 ? (
            <p className="text-sm text-slate-500">Bu dönemde satış yok.</p>
          ) : (
            <ol className="flex flex-col gap-1 text-sm">
              {a.abc
                .filter((p) => p.cls === "A")
                .slice(0, 10)
                .map((p) => (
                  <li key={p.productId} className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className="mr-1 rounded bg-emerald-100 px-1 text-xs font-bold text-emerald-800">A</span>
                      {p.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {formatTRY(p.revenueGrossKurus)} · {formatPermille(p.sharePermille)}
                    </span>
                  </li>
                ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-slate-500">A ürünleri hiç bitmemeli; C ürünlerinin rafta yer kaplamaya değip değmediğine bakın.</p>
        </Section>
      </div>
    </main>
  );
}
