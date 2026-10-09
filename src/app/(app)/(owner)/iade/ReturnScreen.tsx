"use client";

import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { Notice } from "@/client/components/Notice";
import { SaleDetailDialog } from "@/client/components/SaleDetailDialog";

/** Fiş numarasıyla geçmiş bir satışı bulup iade / iptal ekranını açar. */
export function ReturnScreen() {
  const [no, setNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: number; today: string; closed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function find() {
    const v = no.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    try {
      const [r, t] = await Promise.all([
        api<{ id: number }>(`/api/sales/by-receipt/${encodeURIComponent(v)}`),
        api<{ date: string; dayClosed: boolean }>("/api/today-stats"),
      ]);
      setOpen({ id: r.id, today: t.date, closed: t.dayClosed });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Fiş bulunamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">İade</h1>
      <p className="text-slate-600">Müşterinin bilgi fişindeki numarayı yazın (ör. 20261006-0007). Tire olmadan da yazabilirsiniz.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
        className="flex gap-2"
      >
        <input
          autoFocus
          value={no}
          onChange={(e) => setNo(e.target.value)}
          placeholder="Fiş numarası"
          inputMode="numeric"
          className="h-14 flex-1 rounded-xl border-2 border-slate-300 px-4 font-mono text-xl"
          aria-label="Fiş numarası"
          data-testid="receipt-input"
        />
        <button type="submit" disabled={busy} className="h-14 rounded-xl bg-slate-900 px-6 text-lg font-bold text-white disabled:bg-slate-300">
          Bul
        </button>
      </form>
      {error && <Notice kind="error">{error}</Notice>}
      {open && (
        <SaleDetailDialog
          saleId={open.id}
          today={open.today}
          todayClosed={open.closed}
          onClose={() => setOpen(null)}
          onChanged={() => undefined}
        />
      )}
    </main>
  );
}
