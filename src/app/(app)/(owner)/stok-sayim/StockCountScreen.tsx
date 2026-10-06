"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { ProductPicker, type ProductPickerHandle } from "@/client/components/ProductPicker";
import { useMounted } from "@/client/hooks/useMounted";
import { useOwnerProducts, type OwnerLookup, type OwnerProduct } from "@/client/hooks/useOwnerProducts";
import { beepError, beepSuccess } from "@/client/sound";
import { loadJson, removeKey, saveJson } from "@/client/storage";
import type { KasaSettings } from "@/client/types";

const DRAFT_KEY = "mp_stockcount_draft_v1";
const REASONS = ["Sayım farkı", "Fire", "Kırık / hasarlı", "Kayıp", "Son kullanma tarihi geçti", "Diğer"];

interface Line {
  productId: number;
  name: string;
  counted: string;
  reason: string;
  otherText: string;
}

interface AdjustResult {
  productId: number;
  stockBefore: number;
  stockAfter: number;
  difference: number;
  changed: boolean;
}

export function StockCountScreen(props: { settings: KasaSettings; initialProductId: number | null }) {
  const mounted = useMounted();
  if (!mounted) return <p className="p-10 text-center text-slate-500">Yükleniyor…</p>;
  return <StockCount {...props} />;
}

function StockCount({ settings, initialProductId }: { settings: KasaSettings; initialProductId: number | null }) {
  const products = useOwnerProducts();
  const [lines, setLines] = useState<Line[]>(() => loadJson<Line[]>(DRAFT_KEY) ?? []);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [results, setResults] = useState<(AdjustResult & { name: string })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pickerRef = useRef<ProductPickerHandle>(null);
  const countRefs = useRef(new Map<number, HTMLInputElement>());
  const initialDone = useRef(false);

  useEffect(() => saveJson(DRAFT_KEY, lines), [lines]);

  const byId = new Map(products.items.map((p) => [p.id, p]));

  function add(p: OwnerProduct) {
    setLines((ls) => (ls.some((l) => l.productId === p.id) ? ls : [...ls, { productId: p.id, name: p.name, counted: "", reason: REASONS[0]!, otherText: "" }]));
    setNotice({ kind: "info", text: `${p.name}: sistemde ${p.stockQty} adet görünüyor. Saydığınız adedi girin.` });
    if (settings.soundEnabled) beepSuccess();
    requestAnimationFrame(() => countRefs.current.get(p.id)?.focus());
  }

  useEffect(() => {
    if (initialDone.current || !initialProductId || !products.loaded) return;
    initialDone.current = true;
    const p = products.items.find((x) => x.id === initialProductId);
    if (p) window.setTimeout(() => add(p), 0);
  });

  function onResult(r: OwnerLookup) {
    setResults(null);
    if (r.status === "found") return add(r.product);
    if (settings.soundEnabled) beepError();
    setNotice({
      kind: "error",
      text: r.status === "invalid" ? "Barkod hatalı okundu, tekrar okutun." : `Bilinmeyen barkod: ${r.code}. Önce ürünü tanımlayın.`,
    });
  }

  const rows = lines.map((l) => {
    const p = byId.get(l.productId);
    const counted = /^\d+$/.test(l.counted.trim()) ? Number(l.counted) : null;
    const note = l.reason === "Diğer" ? l.otherText.trim() : l.reason;
    return { ...l, product: p, countedN: counted, diff: counted !== null && p ? counted - p.stockQty : null, note };
  });
  const invalid = rows.some((r) => r.countedN === null || !r.note);

  async function save() {
    if (busy || rows.length === 0 || invalid) return;
    setBusy(true);
    try {
      const r = await api<{ results: AdjustResult[] }>("/api/stock/adjust", {
        body: { items: rows.map((x) => ({ productId: x.productId, countedQty: x.countedN, note: x.note })) },
      });
      const names = new Map(rows.map((x) => [x.productId, x.name]));
      setResults(r.results.map((x) => ({ ...x, name: names.get(x.productId) ?? "" })));
      setLines([]);
      removeKey(DRAFT_KEY);
      setNotice(null);
      void products.refresh();
      pickerRef.current?.focus();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Sayım kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 rounded-lg border border-slate-300 px-3 text-base";
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Stok sayımı / düzeltme</h1>
      <p className="text-slate-600">
        Ürünü okutun, rafta saydığınız gerçek adedi girin. Fark, gerekçesiyle birlikte stok hareketi olarak kaydedilir.
      </p>

      <ProductPicker
        ref={pickerRef}
        products={products.items}
        lookup={products.lookup}
        onResult={onResult}
        scanner={{ maxIntervalMs: settings.scannerMaxIntervalMs, minLength: settings.scannerMinLength, dupWindowMs: settings.scannerDupWindowMs }}
        enabled
        placeholder="Sayılan ürünün barkodunu okutun veya adını yazın"
      />

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {products.error && <Notice kind="error">{products.error}</Notice>}

      {results && (
        <Notice kind="success" onClose={() => setResults(null)}>
          <div className="font-semibold">Sayım kaydedildi.</div>
          <ul className="mt-1 text-sm">
            {results.map((r) => (
              <li key={r.productId}>
                {r.name}: {r.changed ? `${r.stockBefore} → ${r.stockAfter} (${r.difference > 0 ? "+" : ""}${r.difference})` : `fark yok (${r.stockAfter})`}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Saymak istediğiniz ürünleri okutun.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Ürün</th>
                <th className="px-3 py-2 text-right">Sistemde</th>
                <th className="px-3 py-2">Sayılan</th>
                <th className="px-3 py-2 text-right">Fark</th>
                <th className="px-3 py-2">Gerekçe</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.product?.stockQty ?? "—"}</td>
                  <td className="px-3 py-2">
                    <input
                      ref={(el) => {
                        if (el) countRefs.current.set(r.productId, el);
                        else countRefs.current.delete(r.productId);
                      }}
                      inputMode="numeric"
                      value={r.counted}
                      onChange={(e) => setLines((ls) => ls.map((l) => (l.productId === r.productId ? { ...l, counted: e.target.value } : l)))}
                      onKeyDown={(e) => e.key === "Enter" && pickerRef.current?.focus()}
                      className={`w-24 ${input} ${r.counted !== "" && r.countedN === null ? "border-red-500" : ""}`}
                      aria-label={`${r.name} sayılan adet`}
                    />
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-bold tabular-nums ${r.diff === null || r.diff === 0 ? "text-slate-500" : r.diff < 0 ? "text-red-700" : "text-emerald-700"}`}
                  >
                    {r.diff === null ? "—" : r.diff > 0 ? `+${r.diff}` : r.diff}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={r.reason}
                        onChange={(e) => setLines((ls) => ls.map((l) => (l.productId === r.productId ? { ...l, reason: e.target.value } : l)))}
                        className={input}
                        aria-label={`${r.name} gerekçe`}
                      >
                        {REASONS.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                      {r.reason === "Diğer" && (
                        <input
                          value={r.otherText}
                          onChange={(e) => setLines((ls) => ls.map((l) => (l.productId === r.productId ? { ...l, otherText: e.target.value } : l)))}
                          placeholder="Açıklama yazın"
                          className={`${input} ${!r.note ? "border-red-500" : ""}`}
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((l) => l.productId !== r.productId))}
                      className="rounded px-2 py-1 text-red-700 hover:bg-red-50"
                      aria-label={`${r.name} satırını sil`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {invalid && <p className="text-sm text-amber-700">Her satır için sayılan adedi ve gerekçeyi girin.</p>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setLines([])} className="h-12 rounded-xl border-2 border-slate-300 px-4 font-semibold">
              Listeyi temizle
            </button>
            <button type="button" onClick={() => void save()} disabled={busy || invalid} className="h-12 rounded-xl bg-emerald-600 px-6 text-lg font-bold text-white disabled:bg-slate-300" data-testid="save-count">
              {busy ? "Kaydediliyor…" : "Sayımı kaydet"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
