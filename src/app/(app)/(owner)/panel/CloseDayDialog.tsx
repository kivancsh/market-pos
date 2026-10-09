"use client";

import { useState } from "react";
import { formatBusinessDate } from "@/lib/businessDate";
import { formatTRY, parseTRYToKurus } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import { Modal } from "@/client/components/Modal";
import { Notice } from "@/client/components/Notice";
import type { Dashboard } from "@/server/services/dashboard";

export function CloseDayDialog({
  data,
  onClose,
  onDone,
}: {
  data: Dashboard;
  onClose: () => void;
  onDone: (backupMessage: string) => void;
}) {
  const s = data.summary;
  const expected = data.closing.expectedCashKurus;
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countedK = counted.trim() === "" ? null : parseTRYToKurus(counted);
  const invalid = counted.trim() !== "" && countedK === null;
  const diff = countedK === null ? null : countedK - expected;

  async function submit() {
    if (busy || invalid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ backup: { ok: boolean; file?: string; error?: string } }>("/api/day-closings", {
        body: { businessDate: data.date, countedCashKurus: countedK, note: note || null },
      });
      onDone(r.backup.ok ? `Gün kapatıldı. Yedek alındı: ${r.backup.file}` : (r.backup.error ?? "Gün kapatıldı."));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gün kapatılamadı.");
      setBusy(false);
    }
  }

  const row = "flex justify-between py-1";
  return (
    <Modal title={`Günü kapat — ${formatBusinessDate(data.date)}`} onClose={busy ? undefined : onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3"
      >
        <dl className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 text-sm">
          <div className={row}><dt>Satış sayısı</dt><dd>{s.saleCount}</dd></div>
          <div className={row}><dt>Ciro (KDV dahil)</dt><dd className="tabular-nums">{formatTRY(s.revenueGrossKurus)}</dd></div>
          <div className={row}><dt>Brüt kâr (KDV hariç)</dt><dd className="tabular-nums">{formatTRY(s.grossProfitKurus)}</dd></div>
          <div className={row}><dt>Kart</dt><dd className="tabular-nums">{formatTRY(s.card.netKurus)}</dd></div>
          <div className={row}><dt>Açılış kasası</dt><dd className="tabular-nums">{formatTRY(data.closing.openingCashKurus)}</dd></div>
          <div className={row}><dt>+ Nakit satış</dt><dd className="tabular-nums">{formatTRY(s.cash.salesKurus)}</dd></div>
          <div className={row}><dt>− Nakit iade</dt><dd className="tabular-nums">{formatTRY(s.cash.refundsKurus)}</dd></div>
          <div className={`${row} text-base font-bold`}><dt>Kasada olması gereken nakit</dt><dd className="tabular-nums" data-testid="expected-cash">{formatTRY(expected)}</dd></div>
        </dl>
        <label className="block font-medium">
          Sayılan nakit (isteğe bağlı)
          <input
            autoFocus
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="Kasadaki parayı sayıp yazın"
            className={`mt-1 h-12 w-full rounded-lg border px-3 text-xl ${invalid ? "border-red-500" : "border-slate-300"}`}
            data-testid="counted-cash"
          />
        </label>
        {diff !== null && (
          <div
            className={`flex justify-between rounded-xl px-4 py-2 text-lg font-bold ${diff === 0 ? "bg-emerald-100 text-emerald-900" : diff > 0 ? "bg-sky-100 text-sky-900" : "bg-red-100 text-red-900"}`}
          >
            <span>{diff === 0 ? "Kasa tam" : diff > 0 ? "Kasa fazlası" : "Kasa açığı"}</span>
            <span className="tabular-nums">{formatTRY(diff)}</span>
          </div>
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" className="h-11 w-full rounded-lg border border-slate-300 px-3" />
        <Notice kind="info">Kapattıktan sonra bu güne satış ve iade yapılamaz (günü yeniden açana kadar). Otomatik yedek alınır.</Notice>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="h-12 flex-1 rounded-xl border-2 border-slate-300 font-semibold">
            Vazgeç
          </button>
          <button type="submit" disabled={busy || invalid} className="h-12 flex-1 rounded-xl bg-slate-900 font-bold text-white disabled:bg-slate-300" data-testid="confirm-close-day">
            {busy ? "Kapatılıyor…" : "Günü kapat"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
