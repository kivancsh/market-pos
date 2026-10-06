"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatTRY, parseTRYToKurus } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import { BarcodeField } from "@/client/components/BarcodeField";
import { Notice } from "@/client/components/Notice";
import type { Category } from "@/client/hooks/useOwnerProducts";
import type { KasaSettings } from "@/client/types";

interface DraftBarcode {
  barcode: string;
  type: "internal" | "manufacturer";
}

export function ProductCreateForm({ settings }: { settings: KasaSettings }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [vat, setVat] = useState<1 | 10 | 20>(20);
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [barcodes, setBarcodes] = useState<DraftBarcode[]>([]);
  const [primary, setPrimary] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: Category[] }>("/api/categories")
      .then((r) => setCategories(r.items))
      .catch(() => undefined);
  }, []);

  const priceK = parseTRYToKurus(price);
  const costK = cost.trim() === "" ? 0 : parseTRYToKurus(cost);
  const belowCost = priceK !== null && costK !== null && costK > 0 && priceK < costK;

  function addBarcode(code: string, type: DraftBarcode["type"]) {
    setBarcodes((b) => [...b, { barcode: code, type }]);
    setPrimary((p) => p ?? code);
    return true;
  }

  async function generate() {
    setBusy(true);
    try {
      const r = await api<{ barcode: string }>("/api/barcodes/generate", { method: "POST" });
      addBarcode(r.barcode, "internal");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Barkod üretilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    if (!name.trim()) return setError("Ürün adı zorunlu.");
    if (priceK === null) return setError("Satış fiyatını 25 veya 25,50 gibi yazın.");
    if (costK === null) return setError("Alış fiyatını 15 veya 15,50 gibi yazın.");
    if (!/^\d+$/.test(stock.trim()) || !/^\d+$/.test(minStock.trim())) return setError("Stok ve min. stok tam sayı olmalı.");
    setBusy(true);
    setError(null);
    const ordered = [...barcodes].sort((a, b) => (a.barcode === primary ? -1 : b.barcode === primary ? 1 : 0));
    try {
      const r = await api<{ product: { id: number } }>("/api/products", {
        body: {
          name: name.trim(),
          categoryName: category.trim() || null,
          salePriceKurus: priceK,
          costPriceKurus: costK,
          vatRate: vat,
          initialStock: Number(stock),
          minStock: Number(minStock),
          barcodes: ordered,
          generateBarcodeIfMissing: true,
        },
      });
      router.push(`/urunler/${r.product.id}?yeni=1`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ürün kaydedilemedi.");
      setBusy(false);
    }
  }

  const field = "mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-lg";
  return (
    <main className="mx-auto w-full max-w-3xl p-3 sm:p-4">
      <Link href="/urunler" className="text-slate-600 hover:underline">
        ← Ürünler
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Yeni ürün</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="mt-4 grid grid-cols-1 gap-4 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2"
      >
        <label className="sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Ürün adı *</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} data-testid="pf-name" />
        </label>

        <fieldset className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
          <legend className="px-1 text-sm font-medium text-slate-700">Barkodlar</legend>
          <BarcodeField
            localCodes={barcodes.map((b) => b.barcode)}
            scanner={{ maxIntervalMs: settings.scannerMaxIntervalMs, minLength: settings.scannerMinLength, dupWindowMs: settings.scannerDupWindowMs }}
            onAdd={(code) => addBarcode(code, "manufacturer")}
            onGenerate={() => void generate()}
            busy={busy}
          />
          {barcodes.length === 0 ? (
            <p className="text-sm text-slate-500">Barkod eklemezseniz kaydederken otomatik dükkân içi barkod üretilir.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {barcodes.map((b) => (
                <li key={b.barcode} className="flex items-center gap-3 py-2">
                  <label className="flex flex-1 items-center gap-2">
                    <input type="radio" name="primary" checked={primary === b.barcode} onChange={() => setPrimary(b.barcode)} className="h-5 w-5" />
                    <span className="font-mono text-lg">{b.barcode}</span>
                    <span className="text-xs text-slate-500">{b.type === "internal" ? "dükkân içi" : "üretici"}</span>
                    {primary === b.barcode && <span className="rounded bg-emerald-100 px-2 text-xs text-emerald-800">birincil (etikette)</span>}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const rest = barcodes.filter((x) => x.barcode !== b.barcode);
                      setBarcodes(rest);
                      if (primary === b.barcode) setPrimary(rest[0]?.barcode ?? null);
                    }}
                    className="rounded px-2 text-red-700 hover:bg-red-50"
                    aria-label={`${b.barcode} barkodunu kaldır`}
                  >
                    Kaldır
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <label>
          <span className="text-sm font-medium text-slate-700">Satış fiyatı (KDV dahil) *</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={field} placeholder="0,00" data-testid="pf-price" />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-700">İlk alış fiyatı (KDV dahil)</span>
          <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={field} placeholder="0,00" />
        </label>
        <div>
          <span className="text-sm font-medium text-slate-700">KDV</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {([1, 10, 20] as const).map((v) => (
              <button key={v} type="button" onClick={() => setVat(v)} aria-pressed={vat === v} className={`h-12 rounded-lg text-lg font-semibold ${vat === v ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
                %{v}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="text-sm font-medium text-slate-700">Kategori</span>
          <input list="pf-categories" value={category} onChange={(e) => setCategory(e.target.value)} className={field} placeholder="Seçin veya yeni yazın" />
          <datalist id="pf-categories">
            {categories.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="text-sm font-medium text-slate-700">Başlangıç stoğu</span>
          <input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} className={field} />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-700">Min. stok (kritik seviye)</span>
          <input inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={field} />
        </label>

        {belowCost && (
          <div className="sm:col-span-2">
            <Notice kind="warn">
              Satış fiyatı ({formatTRY(priceK!)}) alış fiyatının ({formatTRY(costK!)}) altında. Yine de kaydedebilirsiniz.
            </Notice>
          </div>
        )}
        {error && (
          <div className="sm:col-span-2">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        <div className="flex gap-3 sm:col-span-2">
          <Link href="/urunler" className="flex h-14 flex-1 items-center justify-center rounded-xl border-2 border-slate-300 text-lg font-semibold">
            Vazgeç
          </Link>
          <button type="submit" disabled={busy} className="h-14 flex-1 rounded-xl bg-emerald-600 text-lg font-bold text-white disabled:bg-slate-300" data-testid="pf-save">
            {busy ? "Kaydediliyor…" : "Ürünü kaydet"}
          </button>
        </div>
      </form>
    </main>
  );
}
