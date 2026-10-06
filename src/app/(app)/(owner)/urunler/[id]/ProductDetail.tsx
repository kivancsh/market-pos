"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatBusinessDate, formatIstanbulDateTime } from "@/lib/businessDate";
import { formatKurusPlain, formatMargin, formatTRY, parseTRYToKurus } from "@/lib/money";
import { unitEconomics } from "@/lib/pricing";
import { api, ApiError } from "@/client/api";
import { BarChartCard } from "@/client/components/BarChartCard";
import { BarcodeField } from "@/client/components/BarcodeField";
import { Modal } from "@/client/components/Modal";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import type { Category, OwnerProduct } from "@/client/hooks/useOwnerProducts";
import type { KasaSettings } from "@/client/types";

interface Movement {
  id: number;
  type: "initial" | "sale" | "void" | "return" | "purchase" | "adjustment";
  qtyChange: number;
  stockAfter: number;
  unitCostKurus: number | null;
  refType: string | null;
  refId: number | null;
  note: string | null;
  createdAt: string;
}

interface Detail {
  product: OwnerProduct;
  movements: Movement[];
  sales: { businessDate: string; qty: number; revenueKurus: number }[];
}

export const MOVEMENT_LABELS: Record<Movement["type"], string> = {
  initial: "Başlangıç stoğu",
  sale: "Satış",
  void: "Satış iptali",
  return: "İade",
  purchase: "Mal girişi",
  adjustment: "Sayım / düzeltme",
};

export function ProductDetail({ id, isNew, settings }: { id: number; isNew: boolean; settings: KasaSettings }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(
    isNew ? { kind: "success", text: "Ürün kaydedildi." } : null,
  );
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ id: number; barcode: string } | null>(null);

  // Düzenleme formu
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [vat, setVat] = useState(20);
  const [minStock, setMinStock] = useState("0");

  const fill = useCallback((p: OwnerProduct) => {
    setName(p.name);
    setCategory(p.categoryName ?? "");
    setPrice(formatKurusPlain(p.salePriceKurus));
    setVat(p.vatRate);
    setMinStock(String(p.minStock));
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api<Detail>(`/api/products/${id}`);
      setData(d);
      fill(d.product);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Ürün yüklenemedi.");
    }
  }, [id, fill]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    api<{ items: Category[] }>("/api/categories")
      .then((r) => setCategories(r.items))
      .catch(() => undefined);
    return () => window.clearTimeout(t);
  }, [load]);

  async function run(action: () => Promise<{ product: OwnerProduct }>, success: string) {
    setBusy(true);
    try {
      const r = await action();
      setData((d) => (d ? { ...d, product: r.product } : d));
      setNotice({ kind: "success", text: success });
      return true;
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "İşlem yapılamadı." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-5xl p-4">
        <Notice kind="error">{loadError}</Notice>
        <Link href="/urunler" className="mt-4 inline-block underline">
          Ürünlere dön
        </Link>
      </main>
    );
  }
  if (!data) return <p className="p-10 text-center text-slate-500">Yükleniyor…</p>;

  const p = data.product;
  const priceK = parseTRYToKurus(price);
  const u = unitEconomics(p.salePriceKurus, p.avgCostKurus, p.vatRate);
  const belowCost = priceK !== null && priceK < p.avgCostKurus;

  async function saveForm() {
    if (!name.trim()) return setNotice({ kind: "error", text: "Ürün adı zorunlu." });
    if (priceK === null) return setNotice({ kind: "error", text: "Satış fiyatını 25 veya 25,50 gibi yazın." });
    if (!/^\d+$/.test(minStock.trim())) return setNotice({ kind: "error", text: "Min. stok tam sayı olmalı." });
    await run(
      () =>
        api(`/api/products/${id}`, {
          method: "PATCH",
          body: {
            name: name.trim(),
            ...(category.trim() ? { categoryName: category.trim() } : { categoryId: null }),
            salePriceKurus: priceK,
            vatRate: vat,
            minStock: Number(minStock),
          },
        }),
      "Değişiklikler kaydedildi. Geçmiş satışların fiyat ve kârı değişmez.",
    );
  }

  const field = "mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-lg";
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:p-4">
      <div>
        <Link href="/urunler" className="text-slate-600 hover:underline">
          ← Ürünler
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{p.name}</h1>
          {p.isActive ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">Aktif</span>
          ) : (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700">Pasif — satışa kapalı</span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Link href={`/mal-girisi?productId=${p.id}`} className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 font-semibold">
              Mal girişi
            </Link>
            <Link href={`/stok-sayim?productId=${p.id}`} className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 font-semibold">
              Stok sayımı
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => api(`/api/products/${id}`, { method: "PATCH", body: { isActive: !p.isActive } }),
                  p.isActive ? "Ürün pasife alındı; kasada satılamaz." : "Ürün tekrar satışa açıldı.",
                )
              }
              className={`rounded-xl px-3 py-2 font-semibold ${p.isActive ? "bg-slate-200 text-slate-900" : "bg-emerald-600 text-white"}`}
              data-testid="toggle-active"
            >
              {p.isActive ? "Pasife al" : "Aktif yap"}
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Özet">
        {[
          ["Stok", `${p.stockQty} adet`, p.stockQty <= p.minStock ? "text-red-700" : ""],
          ["Ort. maliyet (KDV dahil)", formatTRY(p.avgCostKurus), ""],
          ["Birim kâr (KDV hariç)", formatTRY(u.profitKurus), u.profitKurus < 0 ? "text-red-700" : ""],
          ["Marj", formatMargin(u.profitKurus, u.netPriceKurus), ""],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-2xl bg-white p-3 shadow-sm">
            <div className="text-sm text-slate-600">{label}</div>
            <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveForm();
          }}
          className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2"
        >
          <h2 className="text-lg font-semibold sm:col-span-2">Ürün bilgileri</h2>
          <label className="sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Ürün adı</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Satış fiyatı (KDV dahil)</span>
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={field} data-testid="pd-price" />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Kategori</span>
            <input list="pd-categories" value={category} onChange={(e) => setCategory(e.target.value)} className={field} />
            <datalist id="pd-categories">
              {categories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </label>
          <div>
            <span className="text-sm font-medium text-slate-700">KDV</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {[1, 10, 20].map((v) => (
                <button key={v} type="button" onClick={() => setVat(v)} aria-pressed={vat === v} className={`h-12 rounded-lg font-semibold ${vat === v ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
                  %{v}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="text-sm font-medium text-slate-700">Min. stok</span>
            <input inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={field} />
          </label>
          {belowCost && (
            <div className="sm:col-span-2">
              <Notice kind="warn">Satış fiyatı ortalama maliyetin ({formatTRY(p.avgCostKurus)}) altında.</Notice>
            </div>
          )}
          <p className="text-sm text-slate-500 sm:col-span-2">
            Stok ve maliyet buradan değişmez: <strong>mal girişi</strong> veya <strong>stok sayımı</strong> ile değişir.
          </p>
          <button type="submit" disabled={busy} className="h-12 rounded-xl bg-emerald-600 font-bold text-white disabled:bg-slate-300 sm:col-span-2" data-testid="pd-save">
            Kaydet
          </button>
        </form>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Barkodlar</h2>
          <ul className="mt-2 divide-y divide-slate-100" data-testid="barcode-list">
            {p.barcodes.length === 0 && <li className="py-2 text-slate-500">Barkod yok.</li>}
            {p.barcodes.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-mono text-lg">{b.barcode}</span>
                <span className="text-xs text-slate-500">{b.type === "internal" ? "dükkân içi" : "üretici"}</span>
                {b.isPrimary ? (
                  <span className="rounded bg-emerald-100 px-2 text-xs text-emerald-800">birincil (etikette)</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => api(`/api/products/${id}/barcodes/${b.id}`, { method: "PATCH", body: { isPrimary: true } }), "Birincil barkod değiştirildi.")
                    }
                    className="rounded border border-slate-300 px-2 text-sm"
                  >
                    Birincil yap
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => setConfirmRemove({ id: b.id, barcode: b.barcode })} className="ml-auto rounded px-2 text-sm text-red-700 hover:bg-red-50">
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <BarcodeField
              productId={id}
              scanner={{ maxIntervalMs: settings.scannerMaxIntervalMs, minLength: settings.scannerMinLength, dupWindowMs: settings.scannerDupWindowMs }}
              scannerEnabled={!confirmRemove}
              busy={busy}
              onAdd={(code) => run(() => api(`/api/products/${id}/barcodes`, { body: { barcode: code } }), `${code} eklendi.`)}
              onGenerate={() => void run(() => api(`/api/products/${id}/barcodes`, { body: { generate: true } }), "Dükkân içi barkod üretildi.")}
            />
          </div>
        </section>
      </div>

      <BarChartCard
        title="Son 30 gün — günlük satılan adet"
        valueLabel="Satılan"
        format={(v) => `${v}`}
        data={data.sales.map((s) => ({ label: formatBusinessDate(s.businessDate).slice(0, 5), fullLabel: formatBusinessDate(s.businessDate), value: s.qty }))}
      />

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Stok hareketleri</h2>
        {data.movements.length === 0 ? (
          <p className="py-4 text-slate-500">Henüz hareket yok.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm" data-testid="movements-table">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Tarih</th>
                  <th className="py-2">Hareket</th>
                  <th className="py-2 text-right">Değişim</th>
                  <th className="py-2 text-right">Sonraki stok</th>
                  <th className="py-2 text-right">Birim maliyet</th>
                  <th className="py-2 pl-3">Not</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="py-2 whitespace-nowrap">{formatIstanbulDateTime(m.createdAt)}</td>
                    <td className="py-2">{MOVEMENT_LABELS[m.type]}</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${m.qtyChange < 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {m.qtyChange > 0 ? `+${m.qtyChange}` : m.qtyChange}
                    </td>
                    <td className="py-2 text-right tabular-nums">{m.stockAfter}</td>
                    <td className="py-2 text-right tabular-nums">{m.unitCostKurus === null ? "—" : formatTRY(m.unitCostKurus)}</td>
                    <td className="py-2 pl-3 text-slate-600">{m.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmRemove && (
        <Modal title="Barkod kaldırılsın mı?" onClose={() => setConfirmRemove(null)}>
          <p className="text-lg">
            <span className="font-mono">{confirmRemove.barcode}</span> bu üründen kaldırılacak. Bu barkod okutulunca ürün artık bulunamaz.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" autoFocus onClick={() => setConfirmRemove(null)} className="h-12 rounded-xl border-2 border-slate-300 font-semibold">
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => {
                const b = confirmRemove;
                setConfirmRemove(null);
                void run(() => api(`/api/products/${id}/barcodes/${b.id}`, { method: "DELETE" }), `${b.barcode} kaldırıldı.`);
              }}
              className="h-12 rounded-xl bg-red-600 font-bold text-white"
            >
              Kaldır
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
