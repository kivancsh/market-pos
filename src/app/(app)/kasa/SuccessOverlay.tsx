"use client";

import { useEffect, useRef, useState } from "react";
import { formatTRY } from "@/lib/money";
import { isOkcOpen, type OkcMode, type OkcSaleStatus } from "@/lib/okc";
import { api, ApiError } from "@/client/api";
import type { SaleResponse } from "./PaymentDialog";

/** Satış sonrası ekran. Yazar kasa bağlıysa önce yasal fişin kesilmesini bekler. */
export function SuccessOverlay({
  result,
  okcMode,
  onOkc,
  onRestoreCart,
  onClose,
}: {
  result: SaleResponse;
  okcMode: OkcMode;
  onOkc: (okc: OkcSaleStatus) => void;
  onRestoreCart: (items: { productId: number; qty: number }[]) => void;
  onClose: () => void;
}) {
  const okc = result.okc;
  if (okc && okc.status !== "printed") {
    return <OkcWait result={result} okc={okc} onOkc={onOkc} onRestoreCart={onRestoreCart} onClose={onClose} />;
  }
  return <Done result={result} okcMode={okcMode} onClose={onClose} />;
}

function Done({ result, okcMode, onClose }: { result: SaleResponse; okcMode: OkcMode; onClose: () => void }) {
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
        {result.okc?.status === "printed" && (
          <p className="mt-1 rounded-lg bg-emerald-50 px-3 py-1 text-emerald-900" data-testid="okc-printed">
            🧾 Yazar kasa fişi kesildi
            {result.okc.documentNo && (
              <>
                {" "}
                · fiş no <strong className="font-mono">{result.okc.documentNo}</strong>
              </>
            )}
            {result.okc.zNo && result.okc.zNo !== "SIM" && <> · Z {result.okc.zNo}</>}
          </p>
        )}
        <div className="mt-4 text-2xl">
          Toplam: <span className="font-bold tabular-nums">{formatTRY(s.totalKurus)}</span>{" "}
          <span className="text-base text-slate-500">({s.paymentMethod === "cash" ? "nakit" : "kart"})</span>
        </div>
        {s.paymentMethod === "cash" && s.changeKurus !== null && (
          <div className="mt-3 rounded-2xl bg-amber-100 px-4 py-3">
            <div className="text-lg text-amber-900">Alınan {formatTRY(s.cashReceivedKurus ?? s.totalKurus)} — Para üstü</div>
            <div className="text-6xl font-extrabold tabular-nums text-amber-900" data-testid="change-amount">
              {formatTRY(s.changeKurus)}
            </div>
          </div>
        )}
        {okcMode === "manual" && (
          <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 font-semibold text-sky-900" data-testid="okc-manual-reminder">
            🧾 Yazar kasadan {formatTRY(s.totalKurus)} tutarında fişi kesmeyi unutmayın.
          </p>
        )}
        {result.lowStock.length > 0 && (
          <div className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-left text-sm text-orange-900">
            <strong>Kritik stok:</strong> {result.lowStock.map((l) => `${l.name} (${l.stockQty} kaldı)`).join(", ")}
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

const STEP_TEXT: Record<OkcSaleStatus["provider"], (receiptNo: string) => string> = {
  hugin_cloud: (r) => `Hugin yazar kasada "Siparişler" listesinden "Fiş ${r}" siparişini açıp ödemeyi alın.`,
  pavo_rest: () => "Pavo yazar kasada ödemeyi alın.",
  simulator: () => "Deneme modu: aşağıdaki düğmelerle yazar kasada ödeme alınmış ya da hata vermiş gibi yapın.",
};

/** Yazar kasada yasal fişin kesilmesini bekler; hata/iptal durumlarını yönetir. */
function OkcWait({
  result,
  okc,
  onOkc,
  onRestoreCart,
  onClose,
}: {
  result: SaleResponse;
  okc: OkcSaleStatus;
  onOkc: (okc: OkcSaleStatus) => void;
  onRestoreCart: (items: { productId: number; qty: number }[]) => void;
  onClose: () => void;
}) {
  const s = result.sale;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const latest = useRef(onOkc);
  useEffect(() => {
    latest.current = onOkc;
  }, [onOkc]);

  // Fiş kesilene ya da hata gelene kadar her saniye durumu sor (simülatörde gerek yok)
  const open = isOkcOpen(okc.status);
  useEffect(() => {
    if (!open || okc.provider === "simulator") return;
    let stop = false;
    const t = setInterval(async () => {
      try {
        const r = await api<{ okc: OkcSaleStatus }>(`/api/okc/sales/${s.id}`);
        if (!stop) latest.current(r.okc);
      } catch {
        /* bağlantı anlık koptuysa bir sonraki denemede */
      }
    }, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [open, okc.provider, s.id]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ okc: OkcSaleStatus }>(`/api/okc/sales/${s.id}/${path}`, { body: body ?? {} });
      onOkc(r.okc);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem yapılamadı.");
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  const cancelled = okc.status === "cancelled";
  const failed = okc.status === "failed";

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center p-4 ${failed || cancelled ? "bg-slate-900/80" : "bg-sky-800/90"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="okc-title"
      data-testid="okc-wait"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-center shadow-2xl">
        {cancelled ? (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-4xl" aria-hidden>
              ↩︎
            </div>
            <h2 id="okc-title" className="mt-3 text-2xl font-extrabold text-slate-900">
              Satış iptal edildi
            </h2>
            <p className="mt-2 text-slate-600">Yazar kasada fiş kesilmediği için satış kaydedilmedi; stok geri eklendi.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onRestoreCart(result.items.map((i) => ({ productId: i.productId, qty: i.qty })))}
                className="h-14 rounded-xl bg-emerald-600 text-lg font-bold text-white"
                data-testid="okc-restore-cart"
              >
                Ürünleri sepete geri al
              </button>
              <button type="button" autoFocus onClick={onClose} className="h-14 rounded-xl border-2 border-slate-300 text-lg font-semibold">
                Kapat
              </button>
            </div>
          </>
        ) : (
          <>
            {failed ? (
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-4xl" aria-hidden>
                ⚠️
              </div>
            ) : (
              <div className="mx-auto h-20 w-20 animate-spin rounded-full border-8 border-sky-200 border-t-sky-600" aria-hidden />
            )}
            <h2 id="okc-title" className="mt-3 text-2xl font-extrabold text-slate-900">
              {failed ? "Yazar kasa fişi kesemedi" : "Yazar kasada ödemeyi tamamlayın"}
            </h2>
            <div className="mt-2 text-4xl font-extrabold tabular-nums">{formatTRY(s.totalKurus)}</div>
            <p className="text-slate-500">
              {s.paymentMethod === "cash" ? "Nakit" : "Kart"} · fiş {s.receiptNo}
            </p>
            {failed ? (
              <p role="alert" className="mt-3 rounded-lg bg-red-100 px-3 py-2 font-semibold text-red-900" data-testid="okc-error">
                {okc.errorMessage ?? "Yazar kasa hata verdi."}
              </p>
            ) : (
              <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sky-900">{STEP_TEXT[okc.provider](s.receiptNo)}</p>
            )}
            {s.paymentMethod === "cash" && s.changeKurus !== null && s.changeKurus > 0 && (
              <p className="mt-2 text-lg text-amber-900">
                Para üstü: <strong className="tabular-nums">{formatTRY(s.changeKurus)}</strong>
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-red-900">
                {error}
              </p>
            )}

            {okc.provider === "simulator" && !failed && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  // Bilerek odaklanmaz: okuyucunun Enter'ı ya da yanlışlıkla basılan Enter ödemeyi "alındı" saymasın
                  onClick={() => void act("simulate", { outcome: "paid" })}
                  className="h-14 rounded-xl bg-emerald-600 text-lg font-bold text-white disabled:bg-slate-300"
                  data-testid="okc-sim-paid"
                >
                  Ödeme alındı (deneme)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("simulate", { outcome: "error" })}
                  className="h-14 rounded-xl border-2 border-red-300 text-lg font-semibold text-red-800 disabled:opacity-50"
                  data-testid="okc-sim-error"
                >
                  Hata ver (deneme)
                </button>
              </div>
            )}
            {failed && (
              <button
                type="button"
                disabled={busy}
                autoFocus
                onClick={() => void act("retry")}
                className="mt-5 h-14 w-full rounded-xl bg-sky-600 text-lg font-bold text-white disabled:bg-slate-300"
                data-testid="okc-retry"
              >
                Yazar kasaya tekrar gönder
              </button>
            )}

            {confirmCancel ? (
              <div className="mt-4 rounded-xl bg-red-50 p-3 text-left">
                <p className="font-semibold text-red-900">Yazar kasada fiş kesilmediyse satış iptal edilsin mi? Stok geri eklenir.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act("cancel")}
                    className="h-12 rounded-lg bg-red-600 font-bold text-white disabled:bg-slate-300"
                    data-testid="okc-cancel-confirm"
                  >
                    Evet, iptal et
                  </button>
                  <button type="button" onClick={() => setConfirmCancel(false)} className="h-12 rounded-lg border-2 border-slate-300 font-semibold">
                    Vazgeç
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="mt-4 text-sm font-semibold text-red-700 underline"
                data-testid="okc-cancel"
              >
                Fiş kesilmedi, satışı iptal et
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
