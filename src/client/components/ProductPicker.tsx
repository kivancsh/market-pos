"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { formatTRY } from "@/lib/money";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import type { OwnerLookup, OwnerProduct } from "../hooks/useOwnerProducts";
import type { ScannerConfig } from "../scannerDetector";

export interface ProductPickerHandle {
  focus: () => void;
}

/**
 * Büyük "okut veya ad yaz" alanı: okuyucu (sayfa genelinde), elle barkod + Enter veya
 * ad yazıp öneriden seçme. Sonuç `onResult` ile bildirilir.
 */
export const ProductPicker = forwardRef<
  ProductPickerHandle,
  {
    products: OwnerProduct[];
    lookup: (raw: string) => OwnerLookup;
    onResult: (r: OwnerLookup) => void;
    scanner: ScannerConfig;
    enabled: boolean;
    placeholder?: string;
  }
>(function ProductPicker({ products, lookup, onResult, scanner, enabled, placeholder }, ref) {
  const [input, setInput] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  useBarcodeScanner({
    enabled,
    config: scanner,
    onScan: (code) => {
      setInput("");
      onResult(lookup(code));
    },
  });

  const suggestions = useMemo(() => {
    const q = input.trim().toLocaleLowerCase("tr");
    if (q.length < 2 || /^\d+$/.test(q)) return [];
    return products.filter((p) => p.name.toLocaleLowerCase("tr").includes(q)).slice(0, 8);
  }, [input, products]);

  function pick(p: OwnerProduct) {
    setInput("");
    onResult({ status: "found", product: p, barcode: p.barcodes.find((b) => b.isPrimary)?.barcode ?? "" });
  }

  function submit() {
    const v = input.trim();
    if (!v) return;
    const r = lookup(v);
    if (r.status === "found" || suggestions.length === 0) {
      setInput("");
      onResult(r);
    } else {
      pick(suggestions[Math.min(highlight, suggestions.length - 1)]!);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "ArrowDown" && suggestions.length) {
            e.preventDefault();
            setHighlight((h) => (h + 1) % suggestions.length);
          } else if (e.key === "ArrowUp" && suggestions.length) {
            e.preventDefault();
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Escape") {
            setInput("");
          }
        }}
        placeholder={placeholder ?? "Barkod okutun veya ürün adı yazın"}
        aria-label={placeholder ?? "Barkod okutun veya ürün adı yazın"}
        className="h-14 w-full rounded-2xl border-4 border-slate-300 bg-white px-4 text-xl font-semibold outline-none focus:border-emerald-500"
        data-testid="picker-input"
      />
      {suggestions.length > 0 && (
        <ul className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${i === highlight ? "bg-emerald-100" : "hover:bg-slate-50"}`}
              >
                <span className="font-medium">
                  {s.name}
                  {!s.isActive && <span className="ml-2 text-xs text-red-700">(pasif)</span>}
                </span>
                <span className="text-sm text-slate-600 tabular-nums">
                  stok {s.stockQty} · {formatTRY(s.salePriceKurus)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
