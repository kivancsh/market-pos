"use client";

import { useEffect, useMemo, useState } from "react";
import { labelLayout, paginateLabels } from "@/lib/labels";
import { formatTRY } from "@/lib/money";
import { api } from "@/client/api";
import { Notice } from "@/client/components/Notice";
import { useOwnerProducts, type OwnerProduct } from "@/client/hooks/useOwnerProducts";

interface Label {
  key: string;
  name: string;
  priceKurus: number;
  barcode: string;
}

export function LabelsScreen({
  defaultCols,
  defaultRows,
  initialProductId,
}: {
  defaultCols: number;
  defaultRows: number;
  initialProductId: number | null;
}) {
  const { items, loaded, error } = useOwnerProducts();
  const [counts, setCounts] = useState<Record<number, number>>(() => (initialProductId ? { [initialProductId]: 1 } : {}));
  const [search, setSearch] = useState("");
  const [cols, setCols] = useState(defaultCols);
  const [rows, setRows] = useState(defaultRows);
  const [margin, setMargin] = useState(0);
  const [skip, setSkip] = useState(0);
  const [svgs, setSvgs] = useState<Record<string, string>>({});

  const active = useMemo(() => items.filter((p) => p.isActive), [items]);
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return active.filter((p) => !q || p.name.toLocaleLowerCase("tr").includes(q) || p.barcodes.some((b) => b.barcode.includes(q)));
  }, [active, search]);

  const primaryOf = (p: OwnerProduct) => p.barcodes.find((b) => b.isPrimary)?.barcode ?? null;
  const selected = active.filter((p) => (counts[p.id] ?? 0) > 0);
  const noBarcode = selected.filter((p) => !primaryOf(p));
  const labels: Label[] = selected.flatMap((p) => {
    const bc = primaryOf(p);
    if (!bc) return [];
    return Array.from({ length: counts[p.id]! }, (_, i) => ({ key: `${p.id}-${i}`, name: p.name, priceKurus: p.salePriceKurus, barcode: bc }));
  });
  const layout = labelLayout(cols, rows, margin);
  const pages = paginateLabels(labels, layout.perPage, skip);

  // Barkod görselleri sunucuda üretilir (büyük kütüphane tarayıcıya yüklenmez).
  const missing = [...new Set(labels.map((l) => l.barcode))].filter((c) => !(c in svgs));
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey) return;
    const t = window.setTimeout(async () => {
      const qs = new URLSearchParams();
      for (const c of missingKey.split(",")) qs.append("code", c);
      try {
        const r = await api<{ svgs: Record<string, string> }>(`/api/barcodes/svg?${qs}`);
        setSvgs((s) => ({ ...s, ...r.svgs }));
      } catch {
        // önizlemede barkod yerine numara görünür
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [missingKey]);

  function setCount(id: number, n: number) {
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(500, Math.trunc(n) || 0)) }));
  }

  const num = "h-10 w-20 rounded-lg border border-slate-300 px-2 text-base";
  return (
    <main className="flex w-full flex-1 flex-col gap-4 p-3 sm:p-4 lg:flex-row print:block print:p-0">
      <style>{`@media print { @page { size: A4; margin: 0; } html, body { background: white !important; } }`}</style>

      <section className="flex w-full flex-col gap-3 lg:w-96 print:hidden">
        <h1 className="text-2xl font-bold">Barkod etiketleri</h1>
        <Notice kind="info">Yazdırırken ölçeği <strong>%100 (gerçek boyut)</strong> seçin ve kenar boşluklarını <strong>Yok</strong> yapın.</Notice>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 text-sm shadow-sm">
          <label className="flex flex-col font-medium">
            Sütun
            <input type="number" min={1} max={10} value={cols} onChange={(e) => setCols(Number(e.target.value))} className={num} />
          </label>
          <label className="flex flex-col font-medium">
            Satır
            <input type="number" min={1} max={20} value={rows} onChange={(e) => setRows(Number(e.target.value))} className={num} />
          </label>
          <label className="flex flex-col font-medium">
            Kenar boşluğu (mm)
            <input type="number" min={0} max={30} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className={num} />
          </label>
          <label className="flex flex-col font-medium">
            İlk sayfada atla
            <input type="number" min={0} max={layout.perPage - 1} value={skip} onChange={(e) => setSkip(Number(e.target.value))} className={num} />
          </label>
          <p className="col-span-2 text-slate-600">
            Etiket: {layout.cellWidthMm.toLocaleString("tr-TR")} × {layout.cellHeightMm.toLocaleString("tr-TR")} mm · sayfa başına {layout.perPage}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ürün ara (ad veya barkod)" className="h-11 w-full rounded-lg border border-slate-300 px-3" />
          <div className="mt-2 flex gap-2 text-sm">
            <button type="button" onClick={() => visible.forEach((p) => (counts[p.id] ?? 0) === 0 && setCount(p.id, 1))} className="rounded-lg border border-slate-300 px-3 py-1">
              Görünenleri seç
            </button>
            <button type="button" onClick={() => setCounts({})} className="rounded-lg border border-slate-300 px-3 py-1">
              Seçimi temizle
            </button>
          </div>
          {error && <p className="mt-2 text-red-700">{error}</p>}
          {!loaded ? (
            <p className="py-6 text-center text-slate-500">Yükleniyor…</p>
          ) : (
            <ul className="mt-2 max-h-[55dvh] divide-y divide-slate-100 overflow-y-auto">
              {visible.map((p) => {
                const n = counts[p.id] ?? 0;
                return (
                  <li key={p.id} className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      checked={n > 0}
                      onChange={(e) => setCount(p.id, e.target.checked ? 1 : 0)}
                      className="h-5 w-5"
                      aria-label={`${p.name} seç`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        {primaryOf(p) ?? <span className="text-red-700">barkod yok</span>} · {formatTRY(p.salePriceKurus)}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={n}
                      onChange={(e) => setCount(p.id, Number(e.target.value))}
                      className="h-10 w-16 rounded-lg border border-slate-300 px-2 text-center"
                      aria-label={`${p.name} etiket adedi`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-3 print:block">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <span className="text-lg font-semibold">
            {labels.length} etiket · {pages.length} sayfa
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={labels.length === 0 || missing.length > 0}
            className="ml-auto h-12 rounded-xl bg-emerald-600 px-6 text-lg font-bold text-white disabled:bg-slate-300"
            data-testid="print-labels"
          >
            {missing.length > 0 && labels.length > 0 ? "Barkodlar hazırlanıyor…" : "Yazdır"}
          </button>
        </div>
        {noBarcode.length > 0 && (
          <div className="print:hidden">
            <Notice kind="warn">Barkodu olmayan ürünler atlandı: {noBarcode.map((p) => p.name).join(", ")}. Ürünler sayfasından barkod üretebilirsiniz.</Notice>
          </div>
        )}
        {labels.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 print:hidden">
            Soldan ürün seçin ve her biri için etiket adedini girin.
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl bg-slate-200 p-3 print:overflow-visible print:bg-transparent print:p-0">
            <div className="mx-auto flex w-max flex-col gap-4 [zoom:0.6] sm:[zoom:0.8] print:block print:w-auto print:[zoom:1]">
              {pages.map((page, pi) => (
                <div
                  key={pi}
                  className="label-sheet grid bg-white shadow print:shadow-none"
                  style={{
                    width: "210mm",
                    height: "297mm",
                    padding: `${layout.marginMm}mm`,
                    gridTemplateColumns: `repeat(${layout.cols}, ${layout.cellWidthMm}mm)`,
                    gridTemplateRows: `repeat(${layout.rows}, ${layout.cellHeightMm}mm)`,
                    breakAfter: pi < pages.length - 1 ? "page" : "auto",
                    boxSizing: "border-box",
                  }}
                  data-testid="label-sheet"
                >
                  {page.map((l, i) =>
                    l ? (
                      <div key={`${l.key}-${i}`} className="flex flex-col overflow-hidden border border-dashed border-slate-200 px-[2mm] py-[1.5mm] text-black print:border-transparent">
                        <div className="line-clamp-2 text-[8pt] leading-tight font-semibold">{l.name}</div>
                        <div className="text-[13pt] leading-tight font-extrabold">{formatTRY(l.priceKurus)}</div>
                        <div
                          className="label-barcode mt-auto min-h-0 flex-1 [&>svg]:h-full [&>svg]:w-full"
                          // Sunucuda bwip-js ile üretilmiş SVG (kullanıcı girdisi değil, barkod rakamlarından çizilir)
                          dangerouslySetInnerHTML={{ __html: svgs[l.barcode] ?? "" }}
                        />
                        {!svgs[l.barcode] && <div className="text-center font-mono text-[9pt]">{l.barcode}</div>}
                      </div>
                    ) : (
                      <div key={`empty-${i}`} className="border border-dashed border-slate-100 print:border-transparent" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
