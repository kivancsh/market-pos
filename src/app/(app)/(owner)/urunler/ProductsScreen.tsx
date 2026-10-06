"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { normalizeBarcode } from "@/lib/barcode";
import { formatMargin, formatTRY, marginPermille } from "@/lib/money";
import { unitEconomics } from "@/lib/pricing";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { useBarcodeScanner } from "@/client/hooks/useBarcodeScanner";
import { useOwnerProducts, type OwnerProduct } from "@/client/hooks/useOwnerProducts";
import type { KasaSettings } from "@/client/types";

type SortKey = "name" | "stock" | "price" | "profit" | "margin";
type Status = "active" | "inactive" | "all";

interface Row extends OwnerProduct {
  netPriceKurus: number;
  profitKurus: number;
  marginPm: number | null;
  primary: string | null;
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Ad" },
  { key: "stock", label: "Stok" },
  { key: "price", label: "Satış fiyatı" },
  { key: "profit", label: "Birim kâr" },
  { key: "margin", label: "Marj" },
];

export function ProductsScreen({ settings }: { settings: KasaSettings }) {
  const { items, categories, loaded, error, refresh } = useOwnerProducts();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [status, setStatus] = useState<Status>("active");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Sayfada barkod okutulursa arama alanına yazılır
  useBarcodeScanner({
    enabled: true,
    config: { maxIntervalMs: settings.scannerMaxIntervalMs, minLength: settings.scannerMinLength, dupWindowMs: settings.scannerDupWindowMs },
    onScan: (code) => {
      const n = normalizeBarcode(code);
      setSearch(n.ok ? n.code : code.trim());
      if (!n.ok) setNotice({ kind: "error", text: "Barkod hatalı okundu, tekrar okutun." });
    },
  });

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const digits = /^\d+$/.test(q);
    const list = items
      .filter((p) => status === "all" || (status === "active" ? p.isActive : !p.isActive))
      .filter((p) => category === "all" || String(p.categoryId ?? "none") === category)
      .filter((p) => !criticalOnly || p.stockQty <= p.minStock)
      .filter((p) => {
        if (!q) return true;
        if (p.barcodes.some((b) => (digits ? b.barcode.includes(q) || ("0" + q).includes(b.barcode) : b.barcode.toLocaleLowerCase("tr") === q))) return true;
        return p.name.toLocaleLowerCase("tr").includes(q);
      })
      .map((p) => {
        const u = unitEconomics(p.salePriceKurus, p.avgCostKurus, p.vatRate);
        return {
          ...p,
          netPriceKurus: u.netPriceKurus,
          profitKurus: u.profitKurus,
          marginPm: marginPermille(u.profitKurus, u.netPriceKurus),
          primary: p.barcodes.find((b) => b.isPrimary)?.barcode ?? null,
        };
      });
    const val = (r: Row): number | string => {
      switch (sort.key) {
        case "name":
          return r.name.toLocaleLowerCase("tr");
        case "stock":
          return r.stockQty;
        case "price":
          return r.salePriceKurus;
        case "profit":
          return r.profitKurus;
        case "margin":
          return r.marginPm ?? -Infinity;
      }
    };
    return list.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "tr") * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
  }, [items, search, status, category, criticalOnly, sort]);

  const withoutBarcode = items.filter((p) => p.barcodes.length === 0).length;
  const criticalCount = items.filter((p) => p.isActive && p.stockQty <= p.minStock).length;

  async function generateMissing() {
    setBusy(true);
    try {
      const r = await api<{ generated: unknown[] }>("/api/barcodes/generate-missing", { method: "POST" });
      setNotice({ kind: "success", text: `${r.generated.length} ürüne dükkân içi barkod üretildi.` });
      await refresh();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Barkod üretilemedi." });
    } finally {
      setBusy(false);
    }
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Ürünler</h1>
        <span className="text-slate-600">
          {items.length} ürün{criticalCount > 0 && <> · <span className="font-semibold text-red-700">{criticalCount} kritik stok</span></>}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {withoutBarcode > 0 && (
            <button type="button" onClick={() => void generateMissing()} disabled={busy} className="rounded-xl border-2 border-slate-300 bg-white px-4 py-2 font-semibold">
              Barkodsuz {withoutBarcode} ürüne barkod üret
            </button>
          )}
          <Link href="/urunler/yeni" className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">
            + Yeni ürün
          </Link>
        </div>
      </div>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-3 shadow-sm">
        <label className="flex min-w-56 flex-1 flex-col text-sm font-medium text-slate-700">
          Ara (ad veya barkod — okutabilirsiniz)
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün adı veya barkod"
            className="mt-1 h-11 rounded-lg border border-slate-300 px-3 text-base"
            data-testid="product-search"
          />
        </label>
        <label className="flex flex-col text-sm font-medium text-slate-700">
          Kategori
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 h-11 rounded-lg border border-slate-300 px-2 text-base">
            <option value="all">Tümü</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
            <option value="none">Kategorisiz</option>
          </select>
        </label>
        <label className="flex flex-col text-sm font-medium text-slate-700">
          Durum
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="mt-1 h-11 rounded-lg border border-slate-300 px-2 text-base">
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
            <option value="all">Tümü</option>
          </select>
        </label>
        <label className="flex h-11 items-center gap-2 text-base font-medium">
          <input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} className="h-5 w-5" />
          Sadece kritik stok
        </label>
        <label className="flex flex-col text-sm font-medium text-slate-700 sm:hidden">
          Sırala
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":");
              setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 });
            }}
            className="mt-1 h-11 rounded-lg border border-slate-300 px-2 text-base"
          >
            {SORTS.flatMap((s) => [
              <option key={`${s.key}1`} value={`${s.key}:1`}>{s.label} (artan)</option>,
              <option key={`${s.key}-1`} value={`${s.key}:-1`}>{s.label} (azalan)</option>,
            ])}
          </select>
        </label>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {!loaded ? (
        <p className="py-10 text-center text-slate-500">Ürünler yükleniyor…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">
          {items.length === 0 ? (
            <>
              Henüz ürün yok.{" "}
              <Link href="/urunler/yeni" className="font-semibold text-emerald-700 underline">
                İlk ürünü ekleyin
              </Link>
            </>
          ) : (
            "Filtreye uyan ürün bulunamadı."
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[960px] text-left" data-testid="products-table">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Barkod</th>
                <SortTh label="Ad" k="name" sort={sort} onSort={toggleSort} />
                <th className="px-3 py-2">Kategori</th>
                <th className="px-3 py-2 text-right">Alış (ort.)</th>
                <SortTh label="Satış" k="price" sort={sort} onSort={toggleSort} right />
                <th className="px-3 py-2 text-right">KDV</th>
                <SortTh label="Birim kâr" k="profit" sort={sort} onSort={toggleSort} right />
                <SortTh label="Marj" k="margin" sort={sort} onSort={toggleSort} right />
                <SortTh label="Stok" k="stock" sort={sort} onSort={toggleSort} right />
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const critical = p.stockQty <= p.minStock;
                return (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-sm">
                      {p.primary ?? <span className="text-red-700">yok</span>}
                      {p.barcodes.length > 1 && <span className="ml-1 text-xs text-slate-500">+{p.barcodes.length - 1}</span>}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      <Link href={`/urunler/${p.id}`} className="text-slate-900 underline-offset-2 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.categoryName ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatTRY(p.avgCostKurus)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatTRY(p.salePriceKurus)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">%{p.vatRate}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${p.profitKurus < 0 ? "font-semibold text-red-700" : ""}`}>{formatTRY(p.profitKurus)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${p.marginPm !== null && p.marginPm < 100 ? "font-semibold text-amber-700" : ""}`}>
                      {formatMargin(p.profitKurus, p.netPriceKurus)}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${p.stockQty <= 0 ? "text-red-700" : critical ? "text-amber-700" : ""}`}>
                      {p.stockQty}
                      {p.stockQty <= 0 ? " (bitti)" : critical ? " ⚠" : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{p.minStock}</td>
                    <td className="px-3 py-2">
                      {p.isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800">Aktif</span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-sm text-slate-700">Pasif</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-slate-500">
        Birim kâr = KDV hariç satış fiyatı − KDV hariç ortalama maliyet. Marj = birim kâr / KDV hariç satış fiyatı. Marjı %10&apos;un altındakiler turuncu.
      </p>
    </main>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={`px-3 py-2 ${right ? "text-right" : ""}`} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={`uppercase ${active ? "text-slate-900" : ""}`}>
        {label} {active ? (sort.dir === 1 ? "▲" : "▼") : ""}
      </button>
    </th>
  );
}
