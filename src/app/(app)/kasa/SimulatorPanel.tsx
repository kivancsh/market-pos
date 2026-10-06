"use client";

import { useState } from "react";
import { formatTRY } from "@/lib/money";
import type { CatalogItem } from "@/client/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gerçek okuyucu gibi hızlı keydown olayları + Enter gönderir. Olaylar odaktaki öğeye gönderilir;
 * "odak" seçeneği ile barkod alanı veya sayfa (odak yok) senaryosu denenebilir.
 */
async function sendKeys(code: string, intervalMs: number) {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  for (const ch of code) {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true }));
    await sleep(intervalMs);
  }
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

export function SimulatorPanel({ items, focusBarcode }: { items: CatalogItem[]; focusBarcode: () => void }) {
  const [focusMode, setFocusMode] = useState<"barcode" | "none">("barcode");
  const [interval, setIntervalMs] = useState(8);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  async function scan(code: string, times = 1) {
    if (busy) return;
    setBusy(true);
    if (focusMode === "barcode") focusBarcode();
    else (document.activeElement as HTMLElement | null)?.blur();
    await sleep(30);
    for (let i = 0; i < times; i++) await sendKeys(code, interval);
    setBusy(false);
  }

  const q = filter.toLocaleLowerCase("tr");
  const visible = items.filter((i) => !q || i.name.toLocaleLowerCase("tr").includes(q) || i.barcodes.some((b) => b.includes(q)));
  const firstBarcode = items[0]?.primaryBarcode ?? "2000000000015";
  const badCheck = firstBarcode.slice(0, 12) + String((Number(firstBarcode[12]) + 1) % 10);

  return (
    <aside className="w-full border-t-4 border-amber-400 bg-amber-50 p-3 lg:w-80 lg:border-t-0 lg:border-l-4" aria-label="Okuyucu simülatörü" data-testid="simulator">
      <h2 className="text-lg font-bold text-amber-900">Okuyucu simülatörü</h2>
      <p className="text-xs text-amber-900">Butona basınca barkod, gerçek okuyucu gibi hızlı tuş + Enter olarak gönderilir.</p>

      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col">
          Odak
          <select value={focusMode} onChange={(e) => setFocusMode(e.target.value as "barcode" | "none")} className="rounded border border-amber-300 bg-white p-1">
            <option value="barcode">Barkod alanı</option>
            <option value="none">Odak yok (sayfa)</option>
          </select>
        </label>
        <label className="flex flex-col">
          Tuş aralığı (ms)
          <input type="number" min={1} max={200} value={interval} onChange={(e) => setIntervalMs(Number(e.target.value) || 8)} className="rounded border border-amber-300 bg-white p-1" />
        </label>
      </div>

      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-semibold text-amber-900">Senaryolar</h3>
        <button type="button" disabled={busy} onClick={() => void scan(badCheck)} className="w-full rounded bg-white px-2 py-1 text-left text-sm shadow-sm">
          Hatalı kontrol basamağı ({badCheck})
        </button>
        <button type="button" disabled={busy} onClick={() => void scan("4006381333931")} className="w-full rounded bg-white px-2 py-1 text-left text-sm shadow-sm">
          Bilinmeyen barkod (4006381333931)
        </button>
        <button type="button" disabled={busy} onClick={() => void scan(firstBarcode, 2)} className="w-full rounded bg-white px-2 py-1 text-left text-sm shadow-sm">
          Çok hızlı çift okuma ({firstBarcode})
        </button>
      </div>

      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Ürün ara" className="mt-3 w-full rounded border border-amber-300 bg-white p-2 text-sm" />
      <ul className="mt-2 max-h-[50dvh] space-y-1 overflow-y-auto">
        {visible.map((p) => (
          <li key={p.id} className="rounded bg-white p-2 shadow-sm">
            <div className="flex justify-between text-sm font-semibold">
              <span>{p.name}</span>
              <span className="tabular-nums">{formatTRY(p.salePriceKurus)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.barcodes.map((b) => (
                <button
                  key={b}
                  type="button"
                  disabled={busy}
                  onClick={() => void scan(b)}
                  className="rounded bg-amber-500 px-2 py-1 font-mono text-xs font-semibold text-white active:bg-amber-600 disabled:opacity-50"
                  title={`${b} okut`}
                >
                  Okut {b}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
