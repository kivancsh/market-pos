"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatKurusPlain, formatTRY, parseTRYToKurus } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { ProductPicker, type ProductPickerHandle } from "@/client/components/ProductPicker";
import { QuickProductDialog } from "@/client/components/QuickProductDialog";
import { useMounted } from "@/client/hooks/useMounted";
import { useOwnerProducts, type OwnerLookup, type OwnerProduct } from "@/client/hooks/useOwnerProducts";
import { beepError, beepSuccess } from "@/client/sound";
import { loadJson, removeKey, saveJson } from "@/client/storage";
import type { KasaSettings } from "@/client/types";

const DRAFT_KEY = "mp_purchase_draft_v1";

interface Line {
  productId: number;
  name: string;
  qty: string;
  unitCost: string; // kullanıcının yazdığı metin (KDV dahil TL)
}

interface Draft {
  supplier: string;
  invoiceNo: string;
  note: string;
  lines: Line[];
}

interface PurchaseResult {
  purchaseId: number;
  totalCostKurus: number;
  products: { productId: number; name: string; stockAfter: number; avgCostKurus: number }[];
}

const emptyDraft = (): Draft => ({ supplier: "", invoiceNo: "", note: "", lines: [] });

export function PurchaseScreen(props: { settings: KasaSettings; initialProductId: number | null }) {
  const mounted = useMounted();
  if (!mounted) return <p className="p-10 text-center text-slate-500">Yükleniyor…</p>;
  return <Purchase {...props} />;
}

function Purchase({ settings, initialProductId }: { settings: KasaSettings; initialProductId: number | null }) {
  const products = useOwnerProducts();
  const [draft, setDraft] = useState<Draft>(() => loadJson<Draft>(DRAFT_KEY) ?? emptyDraft());
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string; unknownCode?: string } | null>(null);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const pickerRef = useRef<ProductPickerHandle>(null);
  const qtyRefs = useRef(new Map<number, HTMLInputElement>());
  const initialDone = useRef(false);

  useEffect(() => saveJson(DRAFT_KEY, draft), [draft]);

  const byId = new Map(products.items.map((p) => [p.id, p]));

  function addProduct(p: OwnerProduct, unitCost = formatKurusPlain(p.avgCostKurus)) {
    if (!p.isActive) {
      setNotice({ kind: "error", text: `"${p.name}" pasif. Önce ürün sayfasından aktif yapın.` });
      if (settings.soundEnabled) beepError();
      return;
    }
    setDraft((d) => {
      const existing = d.lines.find((l) => l.productId === p.id);
      const lines = existing
        ? d.lines.map((l) => (l.productId === p.id ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l))
        : [...d.lines, { productId: p.id, name: p.name, qty: "1", unitCost }];
      return { ...d, lines };
    });
    setLastAdded(p.id);
    setNotice({ kind: "success", text: `${p.name} eklendi. Adet ve alış fiyatını kontrol edin.` });
    if (settings.soundEnabled) beepSuccess();
    requestAnimationFrame(() => {
      const el = qtyRefs.current.get(p.id);
      el?.focus();
      el?.select();
    });
  }

  // Ürün sayfasından "Mal girişi" ile gelindiyse ürünü ekle (bir kez)
  useEffect(() => {
    if (initialDone.current || !initialProductId || !products.loaded) return;
    initialDone.current = true;
    const p = products.items.find((x) => x.id === initialProductId);
    if (p) window.setTimeout(() => addProduct(p), 0);
  });

  function onResult(r: OwnerLookup) {
    setResult(null);
    if (r.status === "found") return addProduct(r.product);
    if (settings.soundEnabled) beepError();
    if (r.status === "invalid") setNotice({ kind: "error", text: "Barkod hatalı okundu, tekrar okutun." });
    else setNotice({ kind: "error", text: `Bilinmeyen barkod: ${r.code}`, unknownCode: r.code });
  }

  const parsed = draft.lines.map((l) => {
    const qty = /^\d+$/.test(l.qty.trim()) ? Number(l.qty) : null;
    const cost = parseTRYToKurus(l.unitCost);
    return { ...l, qtyN: qty && qty > 0 ? qty : null, costK: cost };
  });
  const invalid = parsed.some((l) => l.qtyN === null || l.costK === null);
  const total = parsed.reduce((a, l) => a + (l.qtyN ?? 0) * (l.costK ?? 0), 0);

  function updateLine(productId: number, patch: Partial<Line>) {
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)) }));
  }

  async function save() {
    if (busy || draft.lines.length === 0 || invalid) return;
    setBusy(true);
    try {
      const r = await api<PurchaseResult>("/api/purchases", {
        body: {
          supplier: draft.supplier || null,
          invoiceNo: draft.invoiceNo || null,
          note: draft.note || null,
          items: parsed.map((l) => ({ productId: l.productId, qty: l.qtyN, unitCostKurus: l.costK })),
        },
      });
      setResult(r);
      setDraft(emptyDraft());
      removeKey(DRAFT_KEY);
      setNotice(null);
      void products.refresh();
      pickerRef.current?.focus();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Mal girişi kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 rounded-lg border border-slate-300 px-3 text-base";
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Mal girişi</h1>

      <div className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-3 shadow-sm sm:grid-cols-3">
        <label className="flex flex-col text-sm font-medium text-slate-700">
          Tedarikçi (isteğe bağlı)
          <input value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} className={`mt-1 ${input}`} />
        </label>
        <label className="flex flex-col text-sm font-medium text-slate-700">
          Fatura no (isteğe bağlı)
          <input value={draft.invoiceNo} onChange={(e) => setDraft({ ...draft, invoiceNo: e.target.value })} className={`mt-1 ${input}`} />
        </label>
        <label className="flex flex-col text-sm font-medium text-slate-700">
          Not
          <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={`mt-1 ${input}`} />
        </label>
      </div>

      <ProductPicker
        ref={pickerRef}
        products={products.items}
        lookup={products.lookup}
        onResult={onResult}
        scanner={{ maxIntervalMs: settings.scannerMaxIntervalMs, minLength: settings.scannerMinLength, dupWindowMs: settings.scannerDupWindowMs }}
        enabled={quickAdd === null}
        placeholder="Gelen ürünün barkodunu okutun veya adını yazın"
      />

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
          {notice.unknownCode && (
            <button type="button" onClick={() => setQuickAdd(notice.unknownCode!)} className="ml-3 rounded-lg bg-slate-900 px-3 py-1 text-white">
              Bu barkodla yeni ürün tanımla
            </button>
          )}
        </Notice>
      )}
      {products.error && <Notice kind="error">{products.error}</Notice>}

      {result && (
        <Notice kind="success" onClose={() => setResult(null)}>
          <div className="font-semibold">Mal girişi kaydedildi — toplam {formatTRY(result.totalCostKurus)}</div>
          <ul className="mt-1 text-sm">
            {result.products.map((p) => (
              <li key={p.productId}>
                {p.name}: yeni stok <strong>{p.stockAfter}</strong>, yeni ort. maliyet <strong>{formatTRY(p.avgCostKurus)}</strong>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {draft.lines.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Gelen ürünleri okutun. Her ürün için adet ve birim alış fiyatını (KDV dahil, faturadaki) girin.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Ürün</th>
                <th className="px-3 py-2 text-right">Mevcut stok</th>
                <th className="px-3 py-2">Adet</th>
                <th className="px-3 py-2">Birim alış (KDV dahil)</th>
                <th className="px-3 py-2 text-right">Tutar</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {parsed.map((l) => {
                const p = byId.get(l.productId);
                return (
                  <tr key={l.productId} className={`border-t border-slate-100 ${lastAdded === l.productId ? "bg-emerald-50" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{l.name}</div>
                      {p && <div className="text-xs text-slate-500">şu anki ort. maliyet {formatTRY(p.avgCostKurus)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p?.stockQty ?? "—"}</td>
                    <td className="px-3 py-2">
                      <input
                        ref={(el) => {
                          if (el) qtyRefs.current.set(l.productId, el);
                          else qtyRefs.current.delete(l.productId);
                        }}
                        inputMode="numeric"
                        value={l.qty}
                        onChange={(e) => updateLine(l.productId, { qty: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && pickerRef.current?.focus()}
                        className={`w-24 ${input} ${l.qtyN === null ? "border-red-500" : ""}`}
                        aria-label={`${l.name} adet`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        inputMode="decimal"
                        value={l.unitCost}
                        onChange={(e) => updateLine(l.productId, { unitCost: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && pickerRef.current?.focus()}
                        className={`w-32 ${input} ${l.costK === null ? "border-red-500" : ""}`}
                        aria-label={`${l.name} birim alış fiyatı`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {l.qtyN !== null && l.costK !== null ? formatTRY(l.qtyN * l.costK) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.productId !== l.productId) }))}
                        className="rounded px-2 py-1 text-red-700 hover:bg-red-50"
                        aria-label={`${l.name} satırını sil`}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft.lines.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white">
          <div>
            <div className="text-sm text-slate-300">{draft.lines.length} kalem · toplam maliyet</div>
            <div className="text-3xl font-extrabold tabular-nums">{formatTRY(total)}</div>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setDraft(emptyDraft())} className="h-12 rounded-xl border-2 border-slate-500 px-4 font-semibold">
              Listeyi temizle
            </button>
            <button type="button" onClick={() => void save()} disabled={busy || invalid} className="h-12 rounded-xl bg-emerald-500 px-6 text-lg font-bold disabled:bg-slate-600" data-testid="save-purchase">
              {busy ? "Kaydediliyor…" : "Mal girişini kaydet"}
            </button>
          </div>
          {invalid && <p className="w-full text-sm text-amber-300">Kırmızı alanlardaki adet / fiyatı düzeltin.</p>}
        </div>
      )}
      <p className="text-sm text-slate-500">
        Kaydedince stok artar ve ortalama maliyet ağırlıklı ortalamayla güncellenir. Ürünler sayfası: <Link href="/urunler" className="underline">Ürünler</Link>
      </p>

      {quickAdd !== null && (
        <QuickProductDialog
          barcode={quickAdd}
          defaultStock="0"
          stockHint="Gelen adedi bu ekranda gireceksiniz; burayı genelde 0 bırakın."
          onClose={() => setQuickAdd(null)}
          onCreated={async (item) => {
            setQuickAdd(null);
            await products.refresh();
            addProduct({
              id: item.id,
              name: item.name,
              categoryId: null,
              categoryName: null,
              salePriceKurus: item.salePriceKurus,
              avgCostKurus: 0,
              vatRate: item.vatRate,
              stockQty: item.stockQty,
              minStock: item.minStock,
              isActive: true,
              barcodes: [],
            }, "");
          }}
        />
      )}
    </main>
  );
}
