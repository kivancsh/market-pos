"use client";

import { useEffect, useState } from "react";
import { formatTRY, parseTRYToKurus } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import { Modal } from "@/client/components/Modal";
import type { CatalogItem } from "@/client/types";

interface Category {
  id: number;
  name: string;
}

/** Kasada / mal girişinde bilinmeyen barkod için hızlı ürün tanımlama (sadece owner). */
export function QuickProductDialog({
  barcode,
  onClose,
  onCreated,
}: {
  barcode: string;
  onClose: () => void;
  onCreated: (item: CatalogItem) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [vat, setVat] = useState<1 | 10 | 20>(20);
  const [stock, setStock] = useState("1");
  const [minStock, setMinStock] = useState("0");
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: Category[] }>("/api/categories")
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
  }, []);

  const priceK = parseTRYToKurus(price);
  const costK = cost.trim() === "" ? 0 : parseTRYToKurus(cost);
  const stockN = /^\d+$/.test(stock.trim()) ? Number(stock) : null;
  const minN = /^\d+$/.test(minStock.trim()) ? Number(minStock) : null;
  const belowCost = priceK !== null && costK !== null && costK > 0 && priceK < costK;

  async function save() {
    if (busy) return;
    if (!name.trim()) return setError("Ürün adı zorunlu.");
    if (priceK === null) return setError("Satış fiyatını 25 veya 25,50 gibi yazın.");
    if (costK === null) return setError("Alış fiyatını 15 veya 15,50 gibi yazın.");
    if (stockN === null || minN === null) return setError("Stok ve min. stok tam sayı olmalı.");
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ catalogItem: CatalogItem }>("/api/products", {
        body: {
          name: name.trim(),
          categoryName: category.trim() || null,
          salePriceKurus: priceK,
          costPriceKurus: costK,
          vatRate: vat,
          initialStock: stockN,
          minStock: minN,
          barcodes: [{ barcode, type: "manufacturer" }],
        },
      });
      onCreated(r.catalogItem);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ürün kaydedilemedi.");
      setBusy(false);
    }
  }

  const field = "mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-lg";
  return (
    <Modal title="Yeni ürün tanımla" onClose={busy ? undefined : onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Barkod</span>
          <div className="mt-1 rounded-lg bg-slate-100 px-3 py-2 font-mono text-lg">{barcode}</div>
        </div>
        <label className="sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Ürün adı *</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} data-testid="qp-name" />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-700">Satış fiyatı (KDV dahil) *</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={field} placeholder="0,00" data-testid="qp-price" />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-700">Alış fiyatı (KDV dahil)</span>
          <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={field} placeholder="0,00" />
        </label>
        <div>
          <span className="text-sm font-medium text-slate-700">KDV</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {([1, 10, 20] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVat(v)}
                aria-pressed={vat === v}
                className={`h-12 rounded-lg text-lg font-semibold ${vat === v ? "bg-slate-900 text-white" : "bg-slate-100"}`}
              >
                %{v}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="text-sm font-medium text-slate-700">Kategori</span>
          <input list="qp-categories" value={category} onChange={(e) => setCategory(e.target.value)} className={field} placeholder="Seçin veya yazın" />
          <datalist id="qp-categories">
            {categories.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="text-sm font-medium text-slate-700">Mevcut stok (adet)</span>
          <input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} className={field} />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-700">Min. stok</span>
          <input inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={field} />
        </label>
        {belowCost && (
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-amber-900 sm:col-span-2">
            Uyarı: satış fiyatı ({formatTRY(priceK!)}) alış fiyatının ({formatTRY(costK!)}) altında.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 font-semibold text-red-900 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <button type="button" onClick={onClose} disabled={busy} className="h-14 rounded-xl border-2 border-slate-300 text-lg font-semibold">
            Vazgeç
          </button>
          <button type="submit" disabled={busy} className="h-14 rounded-xl bg-emerald-600 text-lg font-bold text-white disabled:bg-slate-300" data-testid="qp-save">
            {busy ? "Kaydediliyor…" : "Kaydet ve sepete ekle"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
