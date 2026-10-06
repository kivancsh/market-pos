"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeBarcode } from "@/lib/barcode";
import { api, ApiError } from "../api";

export interface OwnerBarcode {
  id: number;
  productId: number;
  barcode: string;
  type: "internal" | "manufacturer";
  isPrimary: boolean;
}

export interface OwnerProduct {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  salePriceKurus: number;
  avgCostKurus: number;
  vatRate: number;
  stockQty: number;
  minStock: number;
  isActive: boolean;
  barcodes: OwnerBarcode[];
}

export interface Category {
  id: number;
  name: string;
}

export type OwnerLookup =
  | { status: "found"; product: OwnerProduct; barcode: string }
  | { status: "not_found"; code: string }
  | { status: "invalid"; code: string };

/** Yönetici ekranları için ürün listesi (pasifler ve maliyet dahil) + tarayıcıda barkod eşleşmesi. */
export function useOwnerProducts() {
  const [items, setItems] = useState<OwnerProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ items: OwnerProduct[]; categories: Category[] }>("/api/products");
      setItems(r.items);
      setCategories(r.categories);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ürünler yüklenemedi.");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const byBarcode = useMemo(() => {
    const m = new Map<string, OwnerProduct>();
    for (const p of items) for (const b of p.barcodes) m.set(b.barcode, p);
    return m;
  }, [items]);

  const lookup = useCallback(
    (raw: string): OwnerLookup => {
      const n = normalizeBarcode(raw);
      if (!n.ok) return { status: "invalid", code: n.reason === "empty" ? "" : n.code };
      for (const c of n.candidates) {
        const p = byBarcode.get(c);
        if (p) return { status: "found", product: p, barcode: c };
      }
      return { status: "not_found", code: n.code };
    },
    [byBarcode],
  );

  return { items, categories, loaded, error, refresh, lookup };
}
