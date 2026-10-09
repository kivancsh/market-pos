"use client";

import { useMemo, useState } from "react";
import { formatPermille, formatTRY, parseTRYToKurus } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { useOwnerProducts } from "@/client/hooks/useOwnerProducts";
import type { BulkPriceRow } from "@/server/services/bulkPrice";

type ScopeType = "all" | "category" | "products";
type Rounding = "none" | "r50" | "r100" | "end90";

const ROUNDINGS: { key: Rounding; label: string }[] = [
  { key: "none", label: "Yuvarlama yok" },
  { key: "r50", label: "En yakın 0,50 ₺" },
  { key: "r100", label: "En yakın 1 ₺" },
  { key: "end90", label: "x,90 ₺ ile bitsin" },
];

function errText(e: unknown, fallback: string) {
  if (!(e instanceof ApiError)) return fallback;
  const d = e.details as { issues?: { message: string }[] } | undefined;
  return d?.issues?.map((i) => i.message).join(" ") || e.message;
}

export function BulkPriceScreen() {
  const { items, categories, refresh } = useOwnerProducts();
  const [scopeType, setScopeType] = useState<ScopeType>("category");
  const [categoryId, setCategoryId] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [valueText, setValueText] = useState("");
  const [rounding, setRounding] = useState<Rounding>("none");
  const [rows, setRows] = useState<BulkPriceRow[] | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => items.filter((p) => p.isActive), [items]);
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return active.filter((p) => !q || p.name.toLocaleLowerCase("tr").includes(q));
  }, [active, search]);

  // Yüzde: "7,5" → 750 (yüzün 100 katı); TL: kuruş. İkisi de aynı ayrıştırıcıyla (tam sayı).
  const value = parseTRYToKurus(valueText);
  const valueInvalid = valueText.trim() !== "" && (value === null || value <= 0 || (mode === "percent" && value > 100000));

  function body() {
    const scope =
      scopeType === "all"
        ? { type: "all" }
        : scopeType === "category"
          ? { type: "category", categoryId: categoryId === "none" ? null : Number(categoryId) }
          : { type: "products", productIds: [...selected] };
    return { scope, change: { mode, direction, value, rounding } };
  }

  const ready = value !== null && !valueInvalid && (scopeType !== "category" || categoryId !== "") && (scopeType !== "products" || selected.size > 0);

  async function preview() {
    if (!ready) return;
    setBusy(true);
    setNotice(null);
    try {
      setRows((await api<{ rows: BulkPriceRow[] }>("/api/products/bulk-price/preview", { body: body() })).rows);
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Önizleme yapılamadı.") });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!rows) return;
    const changed = rows.filter((r) => r.newPriceKurus !== r.oldPriceKurus).length;
    if (!window.confirm(`${changed} ürünün fiyatı değişecek. Onaylıyor musunuz?`)) return;
    setBusy(true);
    try {
      const r = await api<{ updated: number }>("/api/products/bulk-price/apply", { body: body() });
      setNotice({ kind: "success", text: `${r.updated} ürünün fiyatı güncellendi. Kasa ekranı 1 dakika içinde yeni fiyatları alır.` });
      setRows(null);
      await refresh();
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Uygulanamadı.") });
    } finally {
      setBusy(false);
    }
  }

  const invalidRows = rows?.filter((r) => r.error).length ?? 0;
  const changedRows = rows?.filter((r) => r.newPriceKurus !== r.oldPriceKurus).length ?? 0;
  const btn = (on: boolean) => `h-11 rounded-lg px-4 font-semibold ${on ? "bg-slate-900 text-white" : "bg-slate-100"}`;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Toplu fiyat güncelleme</h1>
      <p className="text-slate-600">Önce önizleyin; onaylayınca hepsi tek seferde değişir. Geçmiş satışların fiyat ve kârı değişmez. İşlem geçmişine kaydedilir.</p>
      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">1. Hangi ürünler?</h2>
        <div className="flex flex-wrap gap-2">
          {(["category", "products", "all"] as const).map((t) => (
            <button key={t} type="button" onClick={() => (setScopeType(t), setRows(null))} className={btn(scopeType === t)} aria-pressed={scopeType === t}>
              {t === "category" ? "Bir kategori" : t === "products" ? "Seçtiğim ürünler" : "Tüm aktif ürünler"}
            </button>
          ))}
        </div>
        {scopeType === "category" && (
          <select value={categoryId} onChange={(e) => (setCategoryId(e.target.value), setRows(null))} className="h-11 rounded-lg border border-slate-300 px-2" data-testid="bulk-category">
            <option value="">Kategori seçin</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
            <option value="none">Kategorisiz ürünler</option>
          </select>
        )}
        {scopeType === "products" && (
          <div>
            <div className="flex flex-wrap gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ürün ara" className="h-10 flex-1 rounded-lg border border-slate-300 px-3" />
              <button type="button" onClick={() => (setSelected(new Set([...selected, ...visible.map((p) => p.id)])), setRows(null))} className="rounded-lg border border-slate-300 px-3 text-sm">
                Görünenleri seç
              </button>
              <button type="button" onClick={() => (setSelected(new Set()), setRows(null))} className="rounded-lg border border-slate-300 px-3 text-sm">
                Temizle
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">{selected.size} ürün seçili</p>
            <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {visible.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        if (e.target.checked) s.add(p.id);
                        else s.delete(p.id);
                        setSelected(s);
                        setRows(null);
                      }}
                      className="h-5 w-5"
                    />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-sm tabular-nums text-slate-600">{formatTRY(p.salePriceKurus)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">2. Ne kadar?</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button type="button" onClick={() => (setDirection("increase"), setRows(null))} className={btn(direction === "increase")}>
              Zam (artır)
            </button>
            <button type="button" onClick={() => (setDirection("decrease"), setRows(null))} className={btn(direction === "decrease")}>
              İndirim (azalt)
            </button>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button type="button" onClick={() => (setMode("percent"), setRows(null))} className={btn(mode === "percent")}>
              %
            </button>
            <button type="button" onClick={() => (setMode("amount"), setRows(null))} className={btn(mode === "amount")}>
              ₺
            </button>
          </div>
          <input
            inputMode="decimal"
            value={valueText}
            onChange={(e) => (setValueText(e.target.value), setRows(null))}
            placeholder={mode === "percent" ? "ör. 10 veya 7,5" : "ör. 2,50"}
            className={`h-11 w-40 rounded-lg border px-3 text-lg ${valueInvalid ? "border-red-500" : "border-slate-300"}`}
            data-testid="bulk-value"
          />
          <select value={rounding} onChange={(e) => (setRounding(e.target.value as Rounding), setRows(null))} className="h-11 rounded-lg border border-slate-300 px-2">
            {ROUNDINGS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void preview()} disabled={!ready || busy} className="h-11 rounded-xl bg-slate-900 px-5 font-bold text-white disabled:bg-slate-300" data-testid="bulk-preview">
            Önizle
          </button>
        </div>
        {valueInvalid && <p className="text-sm text-red-700">Geçerli bir değer girin (ör. 10 veya 7,5).</p>}
      </section>

      {rows && (
        <section className="space-y-3">
          <p className="font-medium">
            {rows.length} ürün · <span className="text-emerald-700">{changedRows} fiyat değişecek</span>
            {invalidRows > 0 && <span className="text-red-700"> · {invalidRows} üründe fiyat 0&apos;ın altına düşüyor (uygulanamaz)</span>}
          </p>
          <div className="max-h-[50dvh] overflow-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm" data-testid="bulk-table">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">Ürün</th>
                  <th className="px-3 py-2 text-right">Şimdiki</th>
                  <th className="px-3 py-2 text-right">Yeni</th>
                  <th className="px-3 py-2 text-right">Ort. maliyet</th>
                  <th className="px-3 py-2 text-right">Yeni marj</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.productId} className={`border-t border-slate-100 ${r.error ? "bg-red-50 text-red-900" : r.belowCost ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-2">
                      {r.name}
                      {r.error && <span className="ml-2 text-xs font-semibold">{r.error}</span>}
                      {r.belowCost && <span className="ml-2 text-xs font-semibold text-amber-800">maliyetin altında</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatTRY(r.oldPriceKurus)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.newPriceKurus === null ? "—" : formatTRY(r.newPriceKurus)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatTRY(r.avgCostKurus)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPermille(r.newMarginPermille)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy || invalidRows > 0 || changedRows === 0}
            className="h-12 rounded-xl bg-emerald-600 px-6 text-lg font-bold text-white disabled:bg-slate-300"
            data-testid="bulk-apply"
          >
            {busy ? "Uygulanıyor…" : `${changedRows} ürüne uygula`}
          </button>
        </section>
      )}
    </main>
  );
}
