"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBusinessDate, formatIstanbulDateTime } from "@/lib/businessDate";
import { formatTRY } from "@/lib/money";
import { incrementalShare } from "@/lib/pricing";
import { api, ApiError } from "../api";
import { Modal } from "./Modal";
import { Notice } from "./Notice";

interface Sale {
  id: number;
  receiptNo: string;
  createdAt: string;
  businessDate: string;
  status: "completed" | "voided";
  paymentMethod: "cash" | "card";
  subtotalKurus: number;
  discountKurus: number;
  totalKurus: number;
  netTotalKurus: number;
  vatTotalKurus: number;
  costNetTotalKurus: number;
  grossProfitKurus: number;
  cashReceivedKurus: number | null;
  changeKurus: number | null;
  createdByRole: "owner" | "cashier";
  userName?: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

interface Item {
  id: number;
  productNameSnapshot: string;
  barcodeSnapshot: string | null;
  qty: number;
  unitPriceKurus: number;
  lineDiscountKurus: number;
  lineTotalKurus: number;
  lineProfitKurus: number;
  returnedQty: number;
}

interface ReturnRow {
  id: number;
  createdAt: string;
  businessDate: string;
  refundTotalKurus: number;
  profitReversalKurus: number;
  refundMethod: "cash" | "card";
  reason: string | null;
}

interface Detail {
  sale: Sale;
  items: Item[];
  returns: ReturnRow[];
}

type Mode = "view" | "void" | "return";

/**
 * Satış detayı (sadece owner): kalemler, toplamlar, iadeler; buradan iptal ve iade.
 * `today` ve `todayClosed` iptal/iade yapılabilirliğini önceden göstermek içindir; asıl kontrol sunucuda.
 */
export function SaleDetailDialog({
  saleId,
  today,
  todayClosed,
  onClose,
  onChanged,
}: {
  saleId: number;
  today: string;
  todayClosed: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [refundMethod, setRefundMethod] = useState<"cash" | "card">("cash");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Detail>(`/api/sales/${saleId}`);
      setData(d);
      setRefundMethod(d.sale.paymentMethod);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Satış yüklenemedi.");
    }
  }, [saleId]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  if (!data) {
    return (
      <Modal title="Satış detayı" onClose={onClose} wide>
        {error ? <Notice kind="error">{error}</Notice> : <p className="py-6 text-center text-slate-500">Yükleniyor…</p>}
      </Modal>
    );
  }

  const { sale, items, returns } = data;
  const voided = sale.status === "voided";
  const canVoid = !voided && returns.length === 0 && sale.businessDate === today && !todayClosed;
  const returnable = items.some((i) => i.qty - i.returnedQty > 0);
  const canReturn = !voided && returnable && !todayClosed;

  const plan = items
    .map((i) => {
      const raw = qty[i.id] ?? "";
      const n = /^\d+$/.test(raw.trim()) ? Number(raw) : 0;
      const max = i.qty - i.returnedQty;
      return { item: i, n, max, invalid: n > max, refund: n > 0 && n <= max ? incrementalShare(i.lineTotalKurus, i.qty, i.returnedQty, n) : 0 };
    })
    .filter((x) => x.n > 0);
  const planInvalid = plan.some((x) => x.invalid);
  const refundTotal = plan.reduce((a, x) => a + x.refund, 0);

  async function submitVoid() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sales/${sale.id}/void`, { body: { reason } });
      setDone("Satış iptal edildi; stoklar geri eklendi. Bu satış raporlara girmez.");
      setMode("view");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İptal edilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReturn() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ return: { refundTotalKurus: number } }>("/api/returns", {
        body: {
          saleId: sale.id,
          items: plan.map((x) => ({ saleItemId: x.item.id, qty: x.n })),
          refundMethod,
          reason: reason || null,
        },
      });
      setDone(`İade alındı: müşteriye ${formatTRY(r.return.refundTotalKurus)} (${refundMethod === "cash" ? "nakit" : "karta"}) ödeyin. Stok geri eklendi.`);
      setMode("view");
      setQty({});
      setReason("");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İade alınamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Fiş ${sale.receiptNo}`} onClose={busy ? undefined : onClose} wide>
      <div className="space-y-3" data-testid="sale-detail">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>{formatIstanbulDateTime(sale.createdAt)}</span>
          <span>· {sale.paymentMethod === "cash" ? "Nakit" : "Kart"}</span>
          <span>· {sale.userName ? `${sale.userName} (${sale.createdByRole === "owner" ? "yönetici" : "kasiyer"})` : sale.createdByRole === "owner" ? "Yönetici" : "Kasiyer"}</span>
          {voided && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800">İPTAL</span>}
          {returns.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">İade var</span>}
          <a href={`/fis/${sale.id}`} target="_blank" rel="noreferrer" className="ml-auto underline">
            Bilgi fişi
          </a>
        </div>
        {voided && (
          <Notice kind="error">
            {formatIstanbulDateTime(sale.voidedAt!)} tarihinde iptal edildi. Gerekçe: {sale.voidReason}
          </Notice>
        )}
        {done && <Notice kind="success">{done}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Ürün</th>
                <th className="py-1 text-right">Adet</th>
                <th className="py-1 text-right">Birim</th>
                <th className="py-1 text-right">Tutar</th>
                <th className="py-1 text-right">Kâr</th>
                {mode === "return" && <th className="py-1 pl-3">İade adedi</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const max = i.qty - i.returnedQty;
                const p = plan.find((x) => x.item.id === i.id);
                return (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="py-2">
                      <div className="font-medium">{i.productNameSnapshot}</div>
                      {i.lineDiscountKurus > 0 && <div className="text-xs text-emerald-700">indirim −{formatTRY(i.lineDiscountKurus)}</div>}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {i.qty}
                      {i.returnedQty > 0 && <div className="text-xs text-amber-700">{i.returnedQty} iade</div>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatTRY(i.unitPriceKurus)}</td>
                    <td className="py-2 text-right tabular-nums">{formatTRY(i.lineTotalKurus)}</td>
                    <td className={`py-2 text-right tabular-nums ${i.lineProfitKurus < 0 ? "text-red-700" : ""}`}>{formatTRY(i.lineProfitKurus)}</td>
                    {mode === "return" && (
                      <td className="py-2 pl-3">
                        {max > 0 ? (
                          <div className="flex items-center gap-2">
                            <input
                              inputMode="numeric"
                              value={qty[i.id] ?? ""}
                              onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                              placeholder="0"
                              className={`h-10 w-16 rounded-lg border px-2 text-center ${p?.invalid ? "border-red-500" : "border-slate-300"}`}
                              aria-label={`${i.productNameSnapshot} iade adedi`}
                            />
                            <span className="text-xs text-slate-500">en fazla {max}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">tamamı iade edildi</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
          <div className="flex justify-between"><dt>Ara toplam</dt><dd className="tabular-nums">{formatTRY(sale.subtotalKurus)}</dd></div>
          <div className="flex justify-between"><dt>İndirim</dt><dd className="tabular-nums">{formatTRY(sale.discountKurus)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Toplam</dt><dd className="tabular-nums">{formatTRY(sale.totalKurus)}</dd></div>
          <div className="flex justify-between"><dt>KDV hariç</dt><dd className="tabular-nums">{formatTRY(sale.netTotalKurus)}</dd></div>
          <div className="flex justify-between"><dt>KDV</dt><dd className="tabular-nums">{formatTRY(sale.vatTotalKurus)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Brüt kâr</dt><dd className="tabular-nums">{formatTRY(sale.grossProfitKurus)}</dd></div>
          {sale.paymentMethod === "cash" && (
            <>
              <div className="flex justify-between"><dt>Alınan</dt><dd className="tabular-nums">{formatTRY(sale.cashReceivedKurus ?? 0)}</dd></div>
              <div className="flex justify-between"><dt>Para üstü</dt><dd className="tabular-nums">{formatTRY(sale.changeKurus ?? 0)}</dd></div>
            </>
          )}
        </dl>

        {returns.length > 0 && (
          <div>
            <h3 className="font-semibold">İadeler</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {returns.map((r) => (
                <li key={r.id} className="rounded-lg bg-amber-50 px-3 py-2">
                  {formatIstanbulDateTime(r.createdAt)} — {formatTRY(r.refundTotalKurus)} ({r.refundMethod === "cash" ? "nakit" : "kart"})
                  {r.businessDate !== sale.businessDate && <span className="text-slate-600"> · {formatBusinessDate(r.businessDate)} raporunda</span>}
                  {r.reason && <span className="text-slate-600"> · {r.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === "view" && !voided && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={!canReturn}
              onClick={() => {
                setMode("return");
                setDone(null);
                setError(null);
              }}
              className="h-12 rounded-xl bg-amber-500 px-4 font-bold text-white disabled:bg-slate-300"
              data-testid="start-return"
            >
              İade al
            </button>
            <button
              type="button"
              disabled={!canVoid}
              onClick={() => {
                setMode("void");
                setDone(null);
                setError(null);
              }}
              className="h-12 rounded-xl bg-red-600 px-4 font-bold text-white disabled:bg-slate-300"
              data-testid="start-void"
            >
              Satışı iptal et
            </button>
            <p className="w-full text-xs text-slate-500">
              {todayClosed
                ? "Bugün kapatıldı: iptal ve iade için önce günü yeniden açın."
                : !canVoid
                  ? "İptal sadece bugünkü ve iadesi olmayan satışlarda yapılabilir; diğerlerinde iade kullanın."
                  : "İptal: satış hiç olmamış sayılır. İade: ürün geri alınır, bugünün raporundan düşülür."}
            </p>
          </div>
        )}

        {mode === "void" && (
          <form
            className="space-y-2 border-t border-slate-200 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitVoid();
            }}
          >
            <label className="block font-medium">
              İptal gerekçesi *
              <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" placeholder="ör. yanlış ürün okutuldu" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("view")} className="h-11 flex-1 rounded-xl border-2 border-slate-300 font-semibold">
                Vazgeç
              </button>
              <button type="submit" disabled={busy || reason.trim().length < 3} className="h-11 flex-1 rounded-xl bg-red-600 font-bold text-white disabled:bg-slate-300" data-testid="confirm-void">
                {busy ? "İptal ediliyor…" : "Satışı iptal et"}
              </button>
            </div>
          </form>
        )}

        {mode === "return" && (
          <form
            className="space-y-2 border-t border-slate-200 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitReturn();
            }}
          >
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-medium">İade yöntemi:</span>
              {(["cash", "card"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" checked={refundMethod === m} onChange={() => setRefundMethod(m)} className="h-5 w-5" />
                  {m === "cash" ? "Nakit" : "Kart"}
                </label>
              ))}
            </div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3" placeholder="Gerekçe (isteğe bağlı), ör. ürün bozuk" />
            <div className="flex items-center justify-between rounded-xl bg-amber-100 px-4 py-2 text-amber-900">
              <span>Müşteriye ödenecek</span>
              <span className="text-2xl font-extrabold tabular-nums" data-testid="refund-preview">{formatTRY(refundTotal)}</span>
            </div>
            <p className="text-xs text-slate-500">Tutar, satıştaki fiyat ve indirimle hesaplanır (bugünkü fiyatla değil).</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("view")} className="h-11 flex-1 rounded-xl border-2 border-slate-300 font-semibold">
                Vazgeç
              </button>
              <button type="submit" disabled={busy || plan.length === 0 || planInvalid} className="h-11 flex-1 rounded-xl bg-amber-500 font-bold text-white disabled:bg-slate-300" data-testid="confirm-return">
                {busy ? "Kaydediliyor…" : "İadeyi kaydet"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
