"use client";

import { useEffect, useRef, useState } from "react";
import { formatTRY, parseTRYToKurus } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import type { CartState } from "@/client/cart";
import { Modal } from "@/client/components/Modal";
import type { OkcSaleStatus } from "@/lib/okc";

export interface SaleResponse {
  sale: {
    id: number;
    receiptNo: string;
    totalKurus: number;
    paymentMethod: "cash" | "card";
    cashReceivedKurus: number | null;
    changeKurus: number | null;
  };
  items: { productId: number; qty: number }[];
  duplicate: boolean;
  lowStock: { productId: number; name: string; stockQty: number; minStock: number }[];
  warnings: { code: string; message: string }[];
  /** Yazar kasa bağlıysa yasal fiş durumu */
  okc: OkcSaleStatus | null;
}

const QUICK_TL = [50, 100, 200, 500, 1000];

export function PaymentDialog({
  mode,
  cart,
  totalKurus,
  onClose,
  onSwitch,
  onCompleted,
  onStockProblem,
}: {
  mode: "cash" | "card";
  cart: CartState;
  totalKurus: number;
  onClose: () => void;
  onSwitch: (m: "cash" | "card") => void;
  onCompleted: (r: SaleResponse) => void;
  onStockProblem: () => void;
}) {
  const [received, setReceived] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false); // çift tıklama koruması (state güncellenmeden gelen ikinci tık)
  const cashRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // Hata sonrası (buton tekrar etkinleşince) odağı pencereye geri getir; buton kilitliyken odak kaçmış olabilir.
  useEffect(() => {
    if (error && !submitting) (mode === "cash" ? cashRef.current : submitRef.current)?.focus();
  }, [error, submitting, mode]);

  const receivedKurus = received.trim() === "" ? null : parseTRYToKurus(received);
  const receivedInvalid = received.trim() !== "" && receivedKurus === null;
  const effectiveReceived = receivedKurus ?? totalKurus;
  const change = effectiveReceived - totalKurus;
  const cashShort = mode === "cash" && !receivedInvalid && change < 0;

  async function complete() {
    if (lock.current || receivedInvalid || cashShort) return;
    lock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api<SaleResponse>("/api/sales", {
        body: {
          clientRequestId: cart.clientRequestId,
          items: cart.lines.map((l) => ({ productId: l.productId, qty: l.qty, barcode: l.barcode })),
          cartDiscount: cart.discount && cart.discount.value > 0 ? cart.discount : null,
          paymentMethod: mode,
          cashReceivedKurus: mode === "cash" ? receivedKurus : null,
        },
      });
      onCompleted(r);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Satış kaydedilemedi.";
      setError(msg);
      if (e instanceof ApiError && (e.code === "INSUFFICIENT_STOCK" || e.code === "PRODUCT_INACTIVE" || e.code === "PRODUCT_NOT_FOUND")) {
        onStockProblem();
      }
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal title={mode === "cash" ? "Nakit ödeme" : "Kart ile ödeme"} onClose={submitting ? undefined : onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void complete();
        }}
        onKeyDown={(e) => {
          if (e.key === "F8") {
            e.preventDefault();
            onSwitch("cash");
          } else if (e.key === "F9") {
            e.preventDefault();
            onSwitch("card");
          }
        }}
      >
        <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
          <div className="text-sm text-slate-300">Ödenecek</div>
          <div className="text-4xl font-extrabold tabular-nums">{formatTRY(totalKurus)}</div>
        </div>

        {mode === "cash" ? (
          <div className="mt-4">
            <label htmlFor="cash-received" className="font-medium text-slate-700">
              Alınan para (boş bırakılırsa tam tutar)
            </label>
            <input
              id="cash-received"
              ref={cashRef}
              autoFocus
              inputMode="decimal"
              autoComplete="off"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder={formatTRY(totalKurus).replace("₺", "")}
              className="mt-1 h-14 w-full rounded-xl border-2 border-slate-300 px-4 text-2xl font-semibold tabular-nums focus:border-emerald-500"
              data-testid="cash-received"
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setReceived("")}
                className="h-12 rounded-lg bg-slate-200 font-semibold active:bg-slate-300"
              >
                Tam tutar
              </button>
              {QUICK_TL.map((tl) => (
                <button
                  key={tl}
                  type="button"
                  onClick={() => setReceived(String(tl))}
                  className="h-12 rounded-lg bg-slate-200 text-lg font-semibold active:bg-slate-300"
                >
                  {tl} ₺
                </button>
              ))}
            </div>
            <div
              className={`mt-4 flex items-baseline justify-between rounded-xl px-4 py-3 ${cashShort || receivedInvalid ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900"}`}
            >
              <span className="text-lg font-semibold">{cashShort ? "Eksik" : "Para üstü"}</span>
              <span className="text-3xl font-extrabold tabular-nums" data-testid="change-preview">
                {receivedInvalid ? "—" : formatTRY(Math.abs(change))}
              </span>
            </div>
            {receivedInvalid && <p className="mt-1 text-sm text-red-700">Tutarı 200 veya 200,50 gibi yazın.</p>}
          </div>
        ) : (
          <p className="mt-4 text-lg text-slate-700">Kart ödemesini POS cihazından alın, sonra satışı tamamlayın.</p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 font-semibold text-red-900">
            {error}
          </p>
        )}

        <button
          ref={submitRef}
          type="submit"
          autoFocus={mode === "card"}
          disabled={submitting || cashShort || receivedInvalid}
          className="mt-5 h-16 w-full rounded-2xl bg-emerald-600 text-2xl font-extrabold text-white active:bg-emerald-700 disabled:bg-slate-300"
          data-testid="complete-sale"
        >
          {submitting ? "Kaydediliyor…" : "Satışı tamamla (Enter)"}
        </button>
      </form>
    </Modal>
  );
}
