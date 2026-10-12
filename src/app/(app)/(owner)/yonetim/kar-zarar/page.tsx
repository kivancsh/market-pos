import Link from "next/link";
import { addDays, endOfMonth, formatBusinessDate, isBusinessDate, startOfMonth } from "@/lib/businessDate";
import { expenseCategoryLabel } from "@/lib/expenses";
import { formatPermille, formatTRY } from "@/lib/money";
import { requirePageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { todayOf } from "@/server/services/dayClosing";
import { getMonthlyProfitLoss, getProfitLoss } from "@/server/services/expenses";

export const metadata = { title: "Kâr-zarar · Optiva" };

const PRESETS = [
  { key: "bu-ay", label: "Bu ay" },
  { key: "gecen-ay", label: "Geçen ay" },
  { key: "bu-yil", label: "Bu yıl" },
] as const;

function rangeOf(sp: Record<string, string | string[] | undefined>, today: string) {
  const from = typeof sp.from === "string" ? sp.from : null;
  const to = typeof sp.to === "string" ? sp.to : null;
  if (from && to && isBusinessDate(from) && isBusinessDate(to) && from <= to) return { key: "ozel", from, to: to > today ? today : to };
  if (sp.donem === "gecen-ay") {
    const f = startOfMonth(addDays(startOfMonth(today), -1));
    return { key: "gecen-ay", from: f, to: endOfMonth(f) };
  }
  if (sp.donem === "bu-yil") return { key: "bu-yil", from: `${today.slice(0, 4)}-01-01`, to: today };
  return { key: "bu-ay", from: startOfMonth(today), to: today };
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const money = (k: number) => <span className={`tabular-nums ${k < 0 ? "text-red-700" : ""}`}>{formatTRY(k)}</span>;

function Line({ label, value, strong = false, note }: { label: string; value: number; strong?: boolean; note?: string }) {
  return (
    <tr className={strong ? "border-t-2 border-slate-300" : "border-t border-slate-100"}>
      <td className={`py-2 ${strong ? "font-bold" : ""}`}>
        {label}
        {note && <span className="ml-1 text-xs font-normal text-slate-500">{note}</span>}
      </td>
      <td className={`py-2 text-right ${strong ? "text-lg font-bold" : ""}`}>{money(value)}</td>
    </tr>
  );
}

export default async function ProfitLossPage(props: PageProps<"/yonetim/kar-zarar">) {
  await requirePageUser("owner");
  const sp = await props.searchParams;
  const ctx = { db: getDb(), now: () => new Date() };
  const today = todayOf(ctx);
  const r = rangeOf(sp, today);
  const p = getProfitLoss(ctx, r.from, r.to);
  const months = getMonthlyProfitLoss(ctx, today);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kâr-zarar</h1>
          <p className="text-slate-600">
            {formatBusinessDate(r.from)} – {formatBusinessDate(r.to)} · net satış − maliyet − giderler = net kâr
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-1 rounded-xl bg-white p-1 shadow-sm" aria-label="Dönem">
            {PRESETS.map((x) => (
              <Link
                key={x.key}
                href={x.key === "bu-ay" ? "/yonetim/kar-zarar" : `/yonetim/kar-zarar?donem=${x.key}`}
                aria-current={r.key === x.key ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${r.key === x.key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {x.label}
              </Link>
            ))}
          </nav>
          <form className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm" action="/yonetim/kar-zarar">
            <input type="date" name="from" defaultValue={r.from} max={today} className="h-8 rounded-lg border border-slate-300 px-1 text-sm" aria-label="Başlangıç" />
            <input type="date" name="to" defaultValue={r.to} max={today} className="h-8 rounded-lg border border-slate-300 px-1 text-sm" aria-label="Bitiş" />
            <button type="submit" className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Göster
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-4 shadow-sm lg:col-span-2" aria-label="Kâr-zarar tablosu">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Kâr-zarar tablosu</h2>
            <a href={`/api/reports/profit-loss/export?from=${r.from}&to=${r.to}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">
              Excel&apos;e aktar
            </a>
          </div>
          <table className="w-full text-sm" data-testid="pl-table">
            <tbody>
              <Line label="Satışlar (KDV dahil)" value={p.salesGrossKurus} />
              <Line label="İadeler" value={-p.refundsKurus} />
              <Line label="Net satış (KDV hariç)" value={p.revenueNetKurus} strong />
              <Line label="Satılan malın maliyeti (KDV hariç)" value={-p.costNetKurus} />
              <Line label="Brüt kâr" value={p.grossProfitKurus} strong note={`marj ${formatPermille(p.grossMarginPermille)}`} />
              {p.expenses.byCategory.map((c) => (
                <Line key={c.category} label={`${expenseCategoryLabel(c.category)} (KDV hariç)`} value={-c.netKurus} />
              ))}
              <Line label="Toplam gider (KDV hariç)" value={-p.expenses.netKurus} />
              <tr className="border-t-2 border-slate-900">
                <td className="py-3 text-lg font-extrabold">NET KÂR</td>
                <td className={`py-3 text-right text-2xl font-extrabold tabular-nums ${p.netProfitKurus < 0 ? "text-red-700" : "text-emerald-700"}`} data-testid="pl-net">
                  {formatTRY(p.netProfitKurus)}
                </td>
              </tr>
              <tr>
                <td className="pb-1 text-xs text-slate-500" colSpan={2}>
                  Net kâr marjı {formatPermille(p.netMarginPermille)}. Giderleri{" "}
                  <Link href="/yonetim/giderler" className="font-semibold text-emerald-800 underline">
                    Giderler
                  </Link>{" "}
                  ekranından eklersiniz.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="KDV özeti">
            <h2 className="text-lg font-semibold">KDV özeti</h2>
            <p className="mb-2 text-xs text-slate-500">Bilgi amaçlıdır, resmi beyan değildir.</p>
            <table className="w-full text-sm">
              <tbody>
                <Line label="Satıştan hesaplanan" value={p.vat.salesVatKurus} />
                <Line label="Mal alışları" value={-p.vat.purchaseVatKurus} note="(yaklaşık)" />
                <Line label="Giderler" value={-p.vat.expenseVatKurus} />
                <Line label={p.vat.balanceKurus >= 0 ? "Fark (ödenecek)" : "Fark (devreden)"} value={p.vat.balanceKurus} strong />
              </tbody>
            </table>
          </section>
          <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Gider dağılımı">
            <h2 className="mb-2 text-lg font-semibold">Gider dağılımı</h2>
            {p.expenses.byCategory.length === 0 ? (
              <p className="text-sm text-slate-500">
                Bu dönemde gider yok.{" "}
                <Link href="/yonetim/giderler" className="font-semibold text-emerald-800 underline">
                  Gider ekle
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {p.expenses.byCategory.map((c) => (
                  <li key={c.category} className="flex justify-between gap-2">
                    <span>{expenseCategoryLabel(c.category)}</span>
                    <span className="font-semibold tabular-nums">{formatTRY(c.amountKurus)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Son 12 ay">
        <h2 className="mb-2 text-lg font-semibold">Son 12 ay</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-testid="pl-months">
            <thead>
              <tr className="text-right text-xs text-slate-500">
                <th className="py-2 text-left font-medium">Ay</th>
                <th className="py-2 font-medium">Ciro (KDV dahil)</th>
                <th className="py-2 font-medium">Brüt kâr</th>
                <th className="py-2 font-medium">Giderler</th>
                <th className="py-2 font-medium">Net kâr</th>
                <th className="py-2 font-medium">Net marj</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month} className="border-t border-slate-100 text-right">
                  <td className="py-2 text-left">
                    <Link href={`/yonetim/kar-zarar?from=${m.month}-01&to=${endOfMonth(`${m.month}-01`)}`} className="hover:underline">
                      {monthLabel(m.month)}
                    </Link>
                  </td>
                  <td className="py-2">{money(m.revenueGrossKurus)}</td>
                  <td className="py-2">{money(m.grossProfitKurus)}</td>
                  <td className="py-2">{money(-m.expensesNetKurus)}</td>
                  <td className="py-2 font-semibold">{money(m.netProfitKurus)}</td>
                  <td className="py-2">{formatPermille(m.netMarginPermille)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
