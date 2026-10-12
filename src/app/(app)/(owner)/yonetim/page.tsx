import Link from "next/link";
import { formatBusinessDate, formatIstanbulDateTime } from "@/lib/businessDate";
import { formatPermille, formatTRY, mulDivRound } from "@/lib/money";
import { requirePageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { isMailConfigured } from "@/server/mail";
import { getOverview, isOverviewPeriod, type OverviewPeriod } from "@/server/services/overview";
import { cashierLabel } from "@/server/services/reports";
import { OverviewTrend } from "./OverviewTrend";

export const metadata = { title: "Yönetici Paneli · Optiva" };

const PERIODS: { key: OverviewPeriod; label: string; vs: string }[] = [
  { key: "bugun", label: "Bugün", vs: "düne göre" },
  { key: "hafta", label: "Bu hafta", vs: "geçen haftaya göre" },
  { key: "ay", label: "Bu ay", vs: "geçen aya göre" },
];

/** Önceki döneme göre değişim (‰ tam sayı, float yok). */
function delta(cur: number, prev: number): { text: string; tone: "up" | "down" | "flat" } {
  if (prev === 0) return cur === 0 ? { text: "—", tone: "flat" } : { text: "yeni", tone: "up" };
  const p = mulDivRound(cur - prev, 1000, Math.abs(prev));
  if (p === 0) return { text: "değişmedi", tone: "flat" };
  return { text: `${p > 0 ? "▲" : "▼"} ${formatPermille(Math.abs(p))}`, tone: p > 0 ? "up" : "down" };
}

function Kpi({
  label,
  value,
  cur,
  prev,
  vs,
  inverse = false,
  testId,
  href,
}: {
  label: string;
  value: string;
  cur?: number;
  prev?: number;
  vs: string;
  inverse?: boolean;
  testId?: string;
  href?: string;
}) {
  const d = cur !== undefined && prev !== undefined ? delta(cur, prev) : null;
  const good = d && d.tone !== "flat" ? (d.tone === "up") !== inverse : null;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid={testId}>
      <p className="text-sm text-slate-500">
        {href ? (
          <Link href={href} className="hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {d && (
        <p className={`mt-1 text-xs font-medium ${good === null ? "text-slate-500" : good ? "text-emerald-700" : "text-red-700"}`}>
          {d.text} <span className="font-normal text-slate-500">{vs}</span>
        </p>
      )}
    </div>
  );
}

function Card({ title, children, link }: { title: string; children: React.ReactNode; link?: { href: string; label: string } }) {
  return (
    <section className="flex flex-col rounded-2xl bg-white p-4 shadow-sm" aria-label={title}>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="flex-1">{children}</div>
      {link && (
        <Link href={link.href} className="mt-3 text-sm font-semibold text-emerald-800 hover:underline">
          {link.label} →
        </Link>
      )}
    </section>
  );
}

const QUICK = [
  { href: "/urunler/yeni", label: "➕ Yeni ürün / barkod" },
  { href: "/mal-girisi", label: "🚚 Mal girişi" },
  { href: "/stok-sayim", label: "🧮 Stok sayımı" },
  { href: "/etiketler", label: "🖨️ Etiket bas" },
  { href: "/yonetim/toplu-fiyat", label: "🏷️ Toplu fiyat" },
  { href: "/yonetim/kullanicilar", label: "👥 Kasiyer ekle" },
  { href: "/ayarlar#ice-aktar", label: "📥 Excel'den ürün" },
];

/** Yönetici Paneli ana sayfası: Genel bakış. */
export default async function OwnerOverview(props: PageProps<"/yonetim">) {
  const me = await requirePageUser("owner");
  const sp = await props.searchParams;
  const period: OverviewPeriod = isOverviewPeriod(sp.donem) ? sp.donem : "bugun";
  const db = getDb();
  const o = getOverview({ db, now: () => new Date() }, period);
  const emailReady = isMailConfigured(db) && Boolean(me.email);
  const p = PERIODS.find((x) => x.key === period)!;
  const s = o.summary;
  const prev = o.previous;
  const rangeText = o.range.from === o.range.to ? formatBusinessDate(o.range.from) : `${formatBusinessDate(o.range.from)} – ${formatBusinessDate(o.range.to)}`;
  const activeCashiers = o.cashiers.filter((c) => c.saleCount > 0 || c.voidCount > 0 || c.returnCount > 0);
  const alerts = [...o.stock.outOfStock.map((a) => ({ ...a, out: true })), ...o.stock.critical.map((a) => ({ ...a, out: false }))];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Yönetici Paneli</h1>
          <p className="text-slate-600">
            Hoş geldiniz, {me.name}. Genel bakış · {rangeText}
          </p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-white p-1 shadow-sm" aria-label="Dönem">
          {PERIODS.map((x) => (
            <Link
              key={x.key}
              href={x.key === "bugun" ? "/yonetim" : `/yonetim?donem=${x.key}`}
              aria-current={x.key === period ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${x.key === period ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {x.label}
            </Link>
          ))}
        </nav>
      </div>

      {sp.hosgeldin === "1" && (
        <div role="status" className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <strong>Yönetici hesabınız oluşturuldu.</strong> Sırada: <Link href="/yonetim/kullanicilar" className="underline">kasiyer ekleyin</Link>,{" "}
          <Link href="/ayarlar" className="underline">işletme adını girin</Link> ve <Link href="/urunler/yeni" className="underline">ürünlerinizi ekleyin</Link>. Bütün
          yönetim ekranları soldaki menüde.
        </div>
      )}

      {!emailReady && (
        <Link
          href="/ayarlar#eposta"
          className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900 hover:bg-sky-100"
          data-testid="overview-email-cta"
        >
          <span>
            📧 <strong>Gün sonu raporunu e-postayla alın.</strong> Her akşam ciro, kâr ve kasiyer performansı e-postanıza gelsin.
          </span>
          <span className="shrink-0 font-semibold">E-posta bağla →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="overview-kpis">
        <Kpi label="Ciro (KDV dahil)" value={formatTRY(s.revenueGrossKurus)} cur={s.revenueGrossKurus} prev={prev.revenueGrossKurus} vs={p.vs} testId="kpi-revenue" />
        <Kpi label="Brüt kâr (KDV hariç)" value={formatTRY(s.grossProfitKurus)} cur={s.grossProfitKurus} prev={prev.grossProfitKurus} vs={p.vs} />
        <Kpi label="Giderler (KDV hariç)" value={formatTRY(o.expensesNetKurus)} cur={o.expensesNetKurus} prev={o.previousExpensesNetKurus} vs={p.vs} inverse href="/yonetim/giderler" />
        <Kpi
          label="Net kâr"
          value={formatTRY(s.grossProfitKurus - o.expensesNetKurus)}
          cur={s.grossProfitKurus - o.expensesNetKurus}
          prev={prev.grossProfitKurus - o.previousExpensesNetKurus}
          vs={p.vs}
          href="/yonetim/kar-zarar"
          testId="kpi-net"
        />
        <Kpi label="Kâr marjı" value={formatPermille(s.marginPermille)} vs={p.vs} />
        <Kpi label="Satış sayısı" value={s.saleCount.toLocaleString("tr-TR")} cur={s.saleCount} prev={prev.saleCount} vs={p.vs} />
        <Kpi label="Ortalama sepet" value={s.avgBasketKurus === null ? "—" : formatTRY(s.avgBasketKurus)} cur={s.avgBasketKurus ?? 0} prev={prev.avgBasketKurus ?? 0} vs={p.vs} />
        <Kpi label="İadeler" value={formatTRY(s.refundsKurus)} cur={s.refundsKurus} prev={prev.refundsKurus} vs={p.vs} inverse />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OverviewTrend data={o.trend} />
        <Card title={`Kasiyerler · ${p.label.toLocaleLowerCase("tr")}`} link={{ href: `/raporlar?rapor=cashiers`, label: "Ayrıntılı kasiyer performansı" }}>
          {activeCashiers.length === 0 ? (
            <p className="text-sm text-slate-500">Bu dönemde satış yok.</p>
          ) : (
            <table className="w-full text-sm" data-testid="overview-cashiers">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 font-medium">Kasiyer</th>
                  <th className="py-1 text-right font-medium">Satış</th>
                  <th className="py-1 text-right font-medium">Tutar</th>
                  <th className="py-1 text-right font-medium">İptal / iade</th>
                </tr>
              </thead>
              <tbody>
                {activeCashiers.slice(0, 6).map((c) => (
                  <tr key={String(c.userId)} className="border-t border-slate-100">
                    <td className="py-1.5">{cashierLabel(c)}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.saleCount}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{formatTRY(c.salesTotalKurus)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">
                      {c.voidCount} / {c.returnCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Stok uyarıları" link={{ href: "/mal-girisi", label: "Mal girişi yap" }}>
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-500">Kritik seviyede ürün yok.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm" data-testid="overview-stock">
              {alerts.slice(0, 6).map((a) => (
                <li key={a.productId} className="flex justify-between gap-2">
                  <Link href={`/urunler/${a.productId}`} className="truncate hover:underline">
                    {a.name}
                  </Link>
                  <span className={`shrink-0 font-semibold ${a.out ? "text-red-700" : "text-amber-700"}`}>{a.out ? "bitti" : `${a.stockQty} kaldı`}</span>
                </li>
              ))}
              {alerts.length > 6 && <li className="text-xs text-slate-500">ve {alerts.length - 6} ürün daha</li>}
            </ul>
          )}
        </Card>
        <Card title="Bugün" link={{ href: "/panel", label: o.day.closed ? "Gün özeti" : "Gün sonu: Günü Kapat" }}>
          <p className="text-sm">
            {o.day.closed ? (
              <span className="font-semibold text-slate-700">Gün kapatıldı{o.day.cashDifferenceKurus !== null ? ` · kasa farkı ${formatTRY(o.day.cashDifferenceKurus)}` : ""}.</span>
            ) : (
              <span className="font-semibold text-emerald-700">Gün açık, satış yapılabilir.</span>
            )}
          </p>
          <p className="mt-2 text-sm text-slate-600">Kasada olması gereken nakit: {formatTRY(o.day.expectedCashKurus)}</p>
          <p className="mt-1 text-sm text-slate-600">
            {o.counts.products} aktif ürün · {o.counts.cashiers} kasiyer
          </p>
        </Card>
        <Card title="Son işlemler" link={{ href: "/yonetim/islem-gecmisi", label: "İşlem geçmişi" }}>
          {o.recent.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz kayıt yok.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {o.recent.map((e) => (
                <li key={e.id}>
                  <span className="text-xs text-slate-500">{formatIstanbulDateTime(e.createdAt)} · {e.userName ?? "Sistem"}</span>
                  <br />
                  <span className="line-clamp-2">{e.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section aria-label="Hızlı işlemler">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Hızlı işlemler</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
              {q.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
