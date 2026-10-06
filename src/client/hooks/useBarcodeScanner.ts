"use client";

import { useEffect, useRef } from "react";
import { ScannerDetector, type ScannerConfig } from "../scannerDetector";

function isEditable(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/** React kontrollü input'unda değeri değiştirip onChange'i tetikler. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Okuyucunun odaktaki alana yazdığı karakterleri geri alır (best-effort). */
function removeTypedCode(el: HTMLInputElement | HTMLTextAreaElement, code: string): void {
  const v = el.value;
  const idx = v.lastIndexOf(code);
  if (idx === -1) return;
  setNativeValue(el, v.slice(0, idx) + v.slice(idx + code.length));
}

export interface UseBarcodeScannerOptions {
  enabled: boolean;
  config: ScannerConfig;
  onScan: (code: string) => void;
  onDuplicate?: (code: string) => void;
}

/**
 * Okuyucu girişini sayfa genelinde yakalar (window, capture aşaması):
 * - Odak hiçbir yerde değilken veya ana barkod alanındayken: hızlı dizi + Enter → onScan.
 * - Odak başka bir metin alanındayken (ör. indirim): diziyi barkod sayar, o alana yazılan
 *   karakterleri geri alır ve Enter'ın o alanda başka bir şey tetiklemesini engeller.
 * Elle yazılıp Enter'a basılan değerler bu hook'a takılmaz; ana alanın kendi Enter işleyicisi işler.
 */
export function useBarcodeScanner({ enabled, config, onScan, onDuplicate }: UseBarcodeScannerOptions): void {
  const detector = useRef<ScannerDetector | null>(null);
  const latest = useRef({ enabled, onScan, onDuplicate });

  useEffect(() => {
    latest.current = { enabled, onScan, onDuplicate };
  }, [enabled, onScan, onDuplicate]);

  useEffect(() => {
    if (!detector.current) detector.current = new ScannerDetector(config);
    else detector.current.setConfig(config);
  }, [config]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const d = detector.current;
      if (!d || !latest.current.enabled || e.isComposing) return;
      const decision = d.feed({
        key: e.key,
        time: performance.now(),
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      });
      if (decision.type === "none") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isEditable(e.target)) removeTypedCode(e.target, decision.code);
      if (decision.type === "scan") latest.current.onScan(decision.code);
      else latest.current.onDuplicate?.(decision.code);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);
}
