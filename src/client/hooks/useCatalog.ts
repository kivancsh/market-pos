"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeBarcode } from "@/lib/barcode";
import { api, ApiError } from "../api";
import type { CatalogItem } from "../types";

export const CATALOG_REFRESH_MS = 60_000;

export type LookupResult =
  | { status: "found"; product: CatalogItem; barcode: string }
  | { status: "inactive"; product: CatalogItem; barcode: string }
  | { status: "not_found"; code: string }
  | { status: "invalid"; reason: "empty" | "invalid_check_digit"; code: string }
  | { status: "error"; message: string };

interface CatalogResponse {
  items: CatalogItem[];
  generatedAt: string;
}

/**
 * Kasa kataloğu: açılışta tek istekle yüklenir, 60 sn'de bir ve sayfa odağa gelince yenilenir.
 * Barkod → ürün eşleşmesi tarayıcıda Map ile anında yapılır; bulunamazsa sunucuya sorulur.
 */
export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const byBarcode = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) for (const b of i.barcodes) m.set(b, i.id);
    return m;
  }, [items]);

  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    try {
      const r = await api<CatalogResponse>("/api/catalog", { signal: ac.signal });
      setItems(r.items);
      setError(null);
      setLoaded(true);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof ApiError ? e.message : "Ürün listesi yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), CATALOG_REFRESH_MS);
    const onFocus = () => void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      inflight.current?.abort();
    };
  }, [refresh]);

  /** Katalogda ekle/güncelle (ör. hızlı ürün tanımlandıktan sonra). */
  const upsert = useCallback((item: CatalogItem) => {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === item.id);
      if (i === -1) return [...prev, item];
      const next = [...prev];
      next[i] = item;
      return next;
    });
  }, []);

  /** Yerel eşleşme (ağ isteği yok). */
  const lookupLocal = useCallback(
    (raw: string): LookupResult | null => {
      const n = normalizeBarcode(raw);
      if (!n.ok) return { status: "invalid", reason: n.reason, code: n.reason === "empty" ? "" : n.code };
      for (const c of n.candidates) {
        const id = byBarcode.get(c);
        if (id !== undefined) return { status: "found", product: byId.get(id)!, barcode: c };
      }
      return null;
    },
    [byBarcode, byId],
  );

  /** Önce yerel, bulunamazsa sunucu. */
  const lookup = useCallback(
    async (raw: string): Promise<LookupResult> => {
      const local = lookupLocal(raw);
      if (local) return local;
      const code = normalizeBarcode(raw);
      if (!code.ok) return { status: "invalid", reason: code.reason, code: "" };
      try {
        const r = await api<LookupResult>(`/api/barcodes/${encodeURIComponent(code.code)}`);
        if (r.status === "found") upsert(r.product);
        return r;
      } catch (e) {
        return { status: "error", message: e instanceof ApiError ? e.message : "Barkod sorgulanamadı." };
      }
    },
    [lookupLocal, upsert],
  );

  return { items, byId, loaded, error, refresh, upsert, lookup, lookupLocal };
}
