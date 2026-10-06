"use client";

import { formatTRY } from "@/lib/money";
import type { SaleResponse } from "./PaymentDialog";

export function SuccessOverlay({ result, onClose }: { result: SaleResponse; onClose: () => void }) {
  const s = result.sale;
  function printReceipt() {
    window.open(`/fis/${s.id}?print=1`, "fis", "width=420,height=700");
  }
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-emerald-700/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-title"
      data-testid="sale-success"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 text-6xl text-white" aria-hidden>
          ✓
        </div>
        <h2 id="success-title" className="mt-3 text-3xl font-extrabold text-emerald-800">
          Satış tamamlandı
        </h2>
        <p className="mt-1 text-lg text-slate-600">
          Fiş no: <span className="font-mono font-semibold text-slate-900" data-testid="receipt-no">{s.receiptNo}</span>
          {result.duplicate && <span className="ml-2 text-sm">(daha önce kaydedilmişti)</span>}
        </p>
        <div className="mt-4 text-2xl">
          Toplam: <span className="font-bold tabular-nums">{formatTRY(s.totalKurus)}</span>{" "}
          <span className="text-base text-slate-500">({s.paymentMethod === "cash" ? "nakit" : "kart"})</span>
        </div>
        {s.paymentMethod === "cash" && s.changeKurus !== null && (
          <div className="mt-3 rounded-2xl bg-amber-100 px-4 py-3">
            <div className="text-lg text-amber-900">
              Alınan {formatTRY(s.cashReceivedKurus ?? s.totalKurus)} — Para üstü
            </div>
            <div className="text-6xl font-extrabold tabular-nums text-amber-900" data-testid="change-amount">
              {formatTRY(s.changeKurus)}
            </div>
          </div>
        )}
        {result.lowStock.length > 0 && (
          <div className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-left text-sm text-orange-900">
            <strong>Kritik stok:</strong>{" "}
            {result.lowStock.map((l) => `${l.name} (${l.stockQty} kaldı)`).join(", ")}
          </div>
        )}
        {result.warnings.map((w) => (
          <p key={w.code} className="mt-2 text-sm font-medium text-red-700">
            {w.message}
          </p>
        ))}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={printReceipt} className="h-14 rounded-xl border-2 border-slate-300 text-lg font-semibold">
            Bilgi fişi yazdır
          </button>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="h-14 rounded-xl bg-emerald-600 text-lg font-bold text-white"
            data-testid="new-sale"
          >
            Yeni satış (Enter)
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-500">Yeni ürün okutursanız yeni satış otomatik başlar.</p>
      </div>
    </div>
  );
}
