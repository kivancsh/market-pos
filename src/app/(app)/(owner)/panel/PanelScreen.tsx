"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { addDays, formatBusinessDate, formatIstanbulDateTime, formatIstanbulTime } from "@/lib/businessDate";
import { changePermille, formatPermille, formatTRY, formatTRYShort, mulDivRound } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import { BarChartCard } from "@/client/components/BarChartCard";
import { Modal } from "@/client/components/Modal";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { SaleDetailDialog } from "@/client/components/SaleDetailDialog";
import type { PeriodSummary } from "@/server/db/repositories/reports";
import type { Dashboard } from "@/server/services/dashboard";
import { CloseDayDialog } from "./CloseDayDialog";

const REFRESH_MS = 5_000;
// Nakit/kart dağılımı: kategorik palet 1 (mavi) ve 2 (turuncu)
const CARD_COLOR = "#2a78d6";
const CASH_COLOR = "#eb6834";

interface CardDef {
  key: string;
  label: string;
  value: (s: PeriodSummary) => number | null;
  format: (v: number | null) => string;
  /** Artış kötü mü? (iadeler) */
  invert?: boolean;
  /** Marj gibi oranlarda değişim puan farkıyla gösterilir */
  points?: boolean;
  sub?: (s: PeriodSummary) => React.ReactNode;
}

const money = (v: number | null) => (v === null ? "—" : formatTRY(v));

const CARDS: CardDef[] = [
  { key: "gross", label: "Ciro (KDV dahil)", value: (s) => s.revenueGrossKurus, format: money },
  { key: "net", label: "Ciro (KDV hariç)", value: (s) => s.revenueNetKurus, format: money },
  {
    key: "profit",
    label: "Brüt Kâr (KDV hariç)",
    value: (s) => s.grossProfitKurus,
    format: money,
    sub: (s) => (
      <span title="KDV dahil satış tutarı ile KDV dahil maliyet arasındaki fark. Asıl kâr göstergesi KDV hariç brüt kârdır; bu sadece bilgi içindir.">
        KDV dahil fark: {formatTRY(s.vatInclusiveDiffKurus)} <span aria-hidden>ⓘ</span>
      </span>
    ),
  },
  { key: "margin", label: "Kâr Marjı", value: (s) => s.marginPermille, format: formatPermille, points: true },
  {
    key: "count",
    label: "Satış Sayısı",
    value: (s) => s.saleCount,
    format: (v) => String(v ?? 0),
    sub: (s) => (s.voidedCount > 0 ? `${s.voidedCount} iptal (sayılmaz)` : null),
  },
  { key: "basket", label: "Ortalama Sepet", value: (s) => s.avgBasketKurus, format: money },
  { key: "items", label: "Satılan Ürün Adedi", value: (s) => s.itemsSold, format: (v) => String(v ?? 0) },
  {
    key: "returns",
    label: "İadeler",
    value: (s) => s.refundsKurus,
    format: money,
    invert: true,
    sub: (s) => `${s.returnCount} iade · ${s.itemsReturned} ürün`,
  },
];

function Change({ cur, prev, label, invert, points }: { cur: number | null; prev: number | null; label: string; invert?: boolean; points?: boolean }) {
  let text = "—";
  let tone = "text-slate-500";
  if (cur !== null && prev !== null) {
    const pm = points ? cur - prev : changePermille(cur, prev);
    if (pm !== null) {
      const up = pm > 0;
      const good = invert ? !up : up;
      const abs = Math.abs(pm);
      text = `${up ? "▲" : pm < 0 ? "▼" : ""} ${points ? `${(abs - (abs % 10)) / 10},${abs % 10} puan` : formatPermille(abs)}`;
      tone = pm === 0 ? "text-slate-500" : good ? "text-emerald-700" : "text-red-700";
    }
  }
  return (
    <span className={tone}>
      {label}: {text}
    </span>
  );
}

export function PanelScreen({ initialDate }: { initialDate: string | null }) {
  const [date, setDate] = useState<string | null>(initialDate);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"qty" | "profit">("qty");
  const [saleId, setSaleId] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Dashboard>(`/api/dashboard${date ? `?date=${date}` : ""}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Panel yüklenemedi.");
    }
  }, [date]);

  // Açılışta, tarih değişince, 5 sn.de bir (sekme görünürken) ve sayfaya dönünce yenilenir.
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const current = date ?? data?.today ?? null;
  function go(d: string | null) {
    setDate(d);
    const url = d && d !== data?.today ? `/panel?date=${d}` : "/panel";
    window.history.replaceState(null, "", url);
  }

  async function doReopen() {
    if (!data) return;
    setBusy(true);
    try {
      await api(`/api/day-closings/${data.date}/reopen`, { body: { reason: reopenReason } });
      setReopen(false);
      setReopenReason("");
      setNotice({ kind: "success", text: "Gün yeniden açıldı. Satış ve iade yapılabilir; işiniz bitince tekrar kapatın." });
      await load();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Gün açılamadı." });
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-7xl p-4">
        {error ? <Notice kind="error">{error}</Notice> : <p className="py-16 text-center text-slate-500">Panel yükleniyor…</p>}
      </main>
    );
  }

  const s = data.summary;
  const isToday = data.date === data.today;
  const hourly = data.hourly.filter((h, i) => (i >= 8 && i <= 22) || h.saleCount > 0);
  const top = tab === "qty" ? data.topByQty : data.topByProfit;
  const cashNet = Math.max(s.cash.netKurus, 0);
  const cardNet = Math.max(s.card.netKurus, 0);
  const payTotal = cashNet + cardNet;
  const cardPct = payTotal > 0 ? mulDivRound(cardNet, 100, payTotal) : 0; // çubuk genişliği (%)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Panel</h1>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(addDays(data.date, -1))} className="h-11 w-11 rounded-lg border border-slate-300 bg-white text-lg" aria-label="Önceki gün">
            ◀
          </button>
          <input
            type="date"
            value={current ?? ""}
            max={data.today}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="h-11 rounded-lg border border-slate-300 bg-white px-2 text-base"
            aria-label="Tarih"
          />
          <button
            type="button"
            onClick={() => go(addDays(data.date, 1))}
            disabled={isToday}
            className="h-11 w-11 rounded-lg border border-slate-300 bg-white text-lg disabled:opacity-40"
            aria-label="Sonraki gün"
          >
            ▶
          </button>
          {!isToday && (
            <button type="button" onClick={() => go(null)} className="h-11 rounded-lg bg-slate-900 px-3 font-semibold text-white">
              Bugün
            </button>
          )}
        </div>
        <span className="text-slate-600">{formatBusinessDate(data.date)}{isToday && " (bugün) · otomatik yenilenir"}</span>
        <div className="ml-auto">
          {data.closing.closed ? (
            <button type="button" onClick={() => setReopen(true)} className="h-11 rounded-xl border-2 border-slate-300 bg-white px-4 font-semibold">
              Günü yeniden aç
            </button>
          ) : (
            <button type="button" onClick={() => setClosing(true)} className="h-11 rounded-xl bg-slate-900 px-4 font-bold text-white" data-testid="close-day">
              Günü Kapat
            </button>
          )}
        </div>
      </div>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {error && <Notice kind="error">{error} (son yüklenen veriler gösteriliyor)</Notice>}
      {data.closing.closed && (
        <Notice kind="info">
          <strong>Gün kapatıldı</strong> ({formatIstanbulDateTime(data.closing.closedAt!)}). Kasada olması gereken: {formatTRY(data.closing.expectedCashKurus)}
          {data.closing.countedCashKurus !== null && (
            <>
              {" "}· sayılan: {formatTRY(data.closing.countedCashKurus)} · fark:{" "}
              <strong className={data.closing.cashDifferenceKurus! < 0 ? "text-red-700" : ""}>{formatTRY(data.closing.cashDifferenceKurus!)}</strong>
            </>
          )}
          {data.closing.note && <> · not: {data.closing.note}</>}
        </Notice>
      )}
      {!data.closing.closed && data.closing.reopenedAt && (
        <Notice kind="warn">
          Gün yeniden açıldı ({formatIstanbulDateTime(data.closing.reopenedAt)}): {data.closing.reopenReason}
        </Notice>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Günün özeti" data-testid="summary-cards">
        {CARDS.map((c) => {
          const v = c.value(s);
          return (
            <div key={c.key} className="rounded-2xl bg-white p-4 shadow-sm" data-testid={`card-${c.key}`}>
              <div className="text-sm font-medium text-slate-600">{c.label}</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900 sm:text-3xl">{c.format(v)}</div>
              {c.sub && <div className="mt-1 text-xs text-slate-600">{c.sub(s)}</div>}
              <div className="mt-2 flex flex-wrap gap-x-3 text-xs">
                <Change cur={v} prev={c.value(data.compare.yesterday)} label="Düne göre" invert={c.invert} points={c.points} />
                <Change cur={v} prev={c.value(data.compare.lastWeek)} label="Geçen hafta" invert={c.invert} points={c.points} />
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Ödeme dağılımı">
          <h2 className="font-semibold">Nakit / kart</h2>
          {payTotal === 0 ? (
            <p className="py-6 text-center text-slate-500">Bu gün ödeme yok.</p>
          ) : (
            <>
              <div className="mt-3 flex h-4 gap-[2px] overflow-hidden rounded" aria-hidden>
                {cardNet > 0 && <div style={{ width: `${cardPct}%`, background: CARD_COLOR }} className="rounded-l" />}
                {cashNet > 0 && <div style={{ width: `${100 - cardPct}%`, background: CASH_COLOR }} className="rounded-r" />}
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CARD_COLOR }} aria-hidden />
                  <dt className="flex-1">Kart ({s.card.saleCount} satış)</dt>
                  <dd className="font-semibold tabular-nums">{formatTRY(s.card.netKurus)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CASH_COLOR }} aria-hidden />
                  <dt className="flex-1">Nakit ({s.cash.saleCount} satış)</dt>
                  <dd className="font-semibold tabular-nums">{formatTRY(s.cash.netKurus)}</dd>
                </div>
                {(s.cash.refundsKurus > 0 || s.card.refundsKurus > 0) && (
                  <p className="text-xs text-slate-500">İadeler düşülmüş tutarlardır.</p>
                )}
              </dl>
            </>
          )}
        </section>
        <div className="lg:col-span-2">
          <BarChartCard
            title="Saatlik satış (KDV dahil, İstanbul saati)"
            valueLabel="Satış"
            format={formatTRY}
            axisFormat={formatTRYShort}
            data={hourly.map((h) => ({
              label: String(h.hour).padStart(2, "0"),
              fullLabel: `${String(h.hour).padStart(2, "0")}:00–${String(h.hour + 1).padStart(2, "0")}:00 · ${h.saleCount} satış`,
              value: h.totalKurus,
            }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-4 shadow-sm lg:col-span-1" aria-label="En çok satanlar">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 font-semibold">En çok satan 10 ürün</h2>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="tablist">
              {(["qty", "profit"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 font-semibold ${tab === t ? "bg-slate-900 text-white" : "bg-white"}`}
                >
                  {t === "qty" ? "Adet" : "Kâr"}
                </button>
              ))}
            </div>
          </div>
          {top.length === 0 ? (
            <p className="py-6 text-center text-slate-500">Bu gün satış yok.</p>
          ) : (
            <ol className="mt-2 divide-y divide-slate-100">
              {top.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-2 py-2 text-sm">
                  <span className="w-6 text-slate-500">{i + 1}.</span>
                  <Link href={`/urunler/${p.productId}`} className="flex-1 truncate font-medium hover:underline">
                    {p.name}
                  </Link>
                  <span className="tabular-nums font-semibold">{tab === "qty" ? `${p.qty} adet` : formatTRY(p.grossProfitKurus)}</span>
                  <span className="w-20 text-right text-xs text-slate-500 tabular-nums">{tab === "qty" ? formatTRY(p.revenueGrossKurus) : `${p.qty} adet`}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Kritik stok">
          <h2 className="font-semibold">Kritik stok ({data.stock.critical.length})</h2>
          {data.stock.critical.length === 0 ? (
            <p className="py-4 text-slate-500">Kritik seviyede ürün yok.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {data.stock.critical.map((a) => (
                <li key={a.productId} className="flex justify-between py-2">
                  <Link href={`/urunler/${a.productId}`} className="hover:underline">
                    ⚠ {a.name}
                  </Link>
                  <span className="tabular-nums text-amber-700">
                    {a.stockQty} / min {a.minStock}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-4 font-semibold">Stoğu bitenler ({data.stock.outOfStock.length})</h2>
          {data.stock.outOfStock.length === 0 ? (
            <p className="py-4 text-slate-500">Stoğu biten ürün yok.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {data.stock.outOfStock.map((a) => (
                <li key={a.productId} className="flex justify-between py-2">
                  <Link href={`/urunler/${a.productId}`} className="hover:underline">
                    ✕ {a.name}
                  </Link>
                  <span className="font-semibold tabular-nums text-red-700">{a.stockQty}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/mal-girisi" className="mt-3 inline-block text-sm font-semibold text-emerald-700 underline">
            Mal girişi yap →
          </Link>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Günün satışları">
          <h2 className="font-semibold">Günün satışları ({data.sales.length})</h2>
          {data.sales.length === 0 ? (
            <p className="py-4 text-slate-500">Bu gün satış yok.</p>
          ) : (
            <div className="mt-2 max-h-[480px] overflow-y-auto">
              <table className="w-full text-left text-sm" data-testid="day-sales">
                <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1">Fiş</th>
                    <th className="py-1">Saat</th>
                    <th className="py-1 text-right">Tutar</th>
                    <th className="py-1 text-right">Kâr</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.map((x) => (
                    <tr
                      key={x.id}
                      onClick={() => setSaleId(x.id)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${x.status === "voided" ? "text-slate-400 line-through" : ""}`}
                    >
                      <td className="py-2">
                        <button type="button" className="font-mono underline-offset-2 hover:underline" onClick={() => setSaleId(x.id)}>
                          {x.receiptNo.slice(9)}
                        </button>
                        {x.returnCount > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800 no-underline">iade</span>}
                      </td>
                      <td className="py-2">
                        {formatIstanbulTime(new Date(x.createdAt))} <span className="text-xs">{x.paymentMethod === "cash" ? "nakit" : "kart"}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatTRY(x.totalKurus)}</td>
                      <td className="py-2 text-right tabular-nums">{formatTRY(x.grossProfitKurus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link href="/iade" className="mt-3 inline-block text-sm font-semibold text-emerald-700 underline">
            Fiş numarasıyla iade →
          </Link>
        </section>
      </div>

      {saleId !== null && (
        <SaleDetailDialog
          saleId={saleId}
          today={data.today}
          todayClosed={data.date === data.today ? data.closing.closed : false}
          onClose={() => setSaleId(null)}
          onChanged={() => void load()}
        />
      )}
      {closing && (
        <CloseDayDialog
          data={data}
          onClose={() => setClosing(false)}
          onDone={(msg) => {
            setClosing(false);
            setNotice({ kind: "success", text: msg });
            void load();
          }}
        />
      )}
      {reopen && (
        <Modal title="Gün yeniden açılsın mı?" onClose={() => setReopen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doReopen();
            }}
            className="space-y-3"
          >
            <p>Yeniden açınca bu güne satış ve iade yapılabilir. İşiniz bitince günü tekrar kapatın.</p>
            <input autoFocus value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Gerekçe (zorunlu), ör. unutulan satış" className="h-11 w-full rounded-lg border border-slate-300 px-3" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setReopen(false)} className="h-11 flex-1 rounded-xl border-2 border-slate-300 font-semibold">
                Vazgeç
              </button>
              <button type="submit" disabled={busy || reopenReason.trim().length < 3} className="h-11 flex-1 rounded-xl bg-slate-900 font-bold text-white disabled:bg-slate-300">
                Yeniden aç
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
