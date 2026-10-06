"use client";

import { useEffect, useState } from "react";
import { api } from "../api";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import type { ScannerConfig } from "../scannerDetector";

type Check =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; code: string }
  | { state: "bad"; message: string };

/**
 * Barkod ekleme alanı: okut veya yaz; yazarken canlı benzersizlik kontrolü yapılır.
 * Sayfada okutulan barkod (odak nerede olursa olsun) bu alana yazılır.
 * `localCodes`: henüz kaydedilmemiş listedeki barkodlar (onlarla çakışma da engellenir).
 */
export function BarcodeField({
  productId,
  localCodes = [],
  scanner,
  scannerEnabled = true,
  onAdd,
  onGenerate,
  busy = false,
}: {
  productId?: number;
  localCodes?: string[];
  scanner: ScannerConfig;
  scannerEnabled?: boolean;
  onAdd: (code: string) => Promise<boolean> | boolean;
  onGenerate: () => void;
  busy?: boolean;
}) {
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });

  useBarcodeScanner({ enabled: scannerEnabled, config: scanner, onScan: (code) => setValue(code) });

  // Dizi her render'da yeni nesne olur; içeriğe göre bağımlılık (gereksiz tekrar kontrolü önler).
  const localKey = localCodes.join("\n");

  useEffect(() => {
    const local = localKey ? localKey.split("\n") : [];
    const v = value.trim();
    const t = window.setTimeout(async () => {
      if (!v) return setCheck({ state: "idle" });
      if (local.includes(v)) return setCheck({ state: "bad", message: "Bu barkod listede zaten var." });
      setCheck({ state: "checking" });
      try {
        const qs = new URLSearchParams({ code: v });
        if (productId) qs.set("productId", String(productId));
        const r = await api<{ available: boolean; code: string; message?: string }>(`/api/barcodes/availability?${qs}`);
        setCheck(r.available ? { state: "ok", code: r.code } : { state: "bad", message: r.message ?? "Kullanılamaz." });
      } catch {
        setCheck({ state: "bad", message: "Kontrol edilemedi." });
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [value, productId, localKey]);

  async function add() {
    if (check.state !== "ok" || busy) return;
    if (await onAdd(check.code)) {
      setValue("");
      setCheck({ state: "idle" });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // formu göndermesin
              void add();
            }
          }}
          placeholder="Barkodu okutun veya yazın"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 font-mono text-lg"
          aria-label="Yeni barkod"
          data-testid="barcode-field"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={check.state !== "ok" || busy}
          className="h-12 rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:bg-slate-300"
        >
          Ekle
        </button>
        <button type="button" onClick={onGenerate} disabled={busy} className="h-12 rounded-lg border-2 border-slate-300 px-4 font-semibold">
          Dükkân içi barkod üret
        </button>
      </div>
      <p className="mt-1 min-h-5 text-sm" aria-live="polite">
        {check.state === "checking" && <span className="text-slate-500">Kontrol ediliyor…</span>}
        {check.state === "ok" && <span className="font-medium text-emerald-700">✓ Kullanılabilir</span>}
        {check.state === "bad" && <span className="font-medium text-red-700">✗ {check.message}</span>}
      </p>
    </div>
  );
}
