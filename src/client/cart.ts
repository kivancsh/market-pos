/**
 * Kasa sepeti (saf mantık). Fiyatlar burada sadece GÖSTERİM içindir; satışta sunucu her şeyi
 * veritabanından yeniden hesaplar.
 */
import { resolveCartDiscount, type CartDiscount } from "@/lib/pricing";
import type { CatalogItem } from "./types";

export interface CartLine {
  productId: number;
  name: string;
  unitPriceKurus: number;
  vatRate: number;
  stockQty: number;
  qty: number;
  barcode: string | null;
}

export interface CartState {
  lines: CartLine[];
  clientRequestId: string;
  discount: CartDiscount | null;
  /** En son eklenen/dokunulan satır (vurgulanır, Delete ile silinir). */
  selectedId: number | null;
  /** Vurgu animasyonunu yeniden tetiklemek için sayaç. */
  flash: number;
}

export type CartAction =
  | { type: "add"; product: CatalogItem; barcode: string | null }
  | { type: "setQty"; productId: number; qty: number }
  | { type: "remove"; productId: number }
  | { type: "select"; productId: number }
  | { type: "setDiscount"; discount: CartDiscount | null }
  | { type: "syncCatalog"; byId: Map<number, CatalogItem> }
  | { type: "reset"; clientRequestId: string };

export const MAX_QTY = 9999;

export function emptyCart(clientRequestId: string): CartState {
  return { lines: [], clientRequestId, discount: null, selectedId: null, flash: 0 };
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const p = action.product;
      const existing = state.lines.find((l) => l.productId === p.id);
      const lines = existing
        ? state.lines.map((l) => (l.productId === p.id ? { ...l, qty: Math.min(l.qty + 1, MAX_QTY) } : l))
        : [
            ...state.lines,
            {
              productId: p.id,
              name: p.name,
              unitPriceKurus: p.salePriceKurus,
              vatRate: p.vatRate,
              stockQty: p.stockQty,
              qty: 1,
              barcode: action.barcode,
            },
          ];
      return { ...state, lines, selectedId: p.id, flash: state.flash + 1 };
    }
    case "setQty": {
      const qty = Math.max(1, Math.min(MAX_QTY, Math.trunc(action.qty)));
      if (!Number.isFinite(qty)) return state;
      return {
        ...state,
        lines: state.lines.map((l) => (l.productId === action.productId ? { ...l, qty } : l)),
        selectedId: action.productId,
      };
    }
    case "remove": {
      const lines = state.lines.filter((l) => l.productId !== action.productId);
      return { ...state, lines, selectedId: lines.at(-1)?.productId ?? null };
    }
    case "select":
      return { ...state, selectedId: action.productId };
    case "setDiscount":
      return { ...state, discount: action.discount };
    case "syncCatalog":
      return {
        ...state,
        lines: state.lines.map((l) => {
          const p = action.byId.get(l.productId);
          return p ? { ...l, name: p.name, unitPriceKurus: p.salePriceKurus, vatRate: p.vatRate, stockQty: p.stockQty } : l;
        }),
      };
    case "reset":
      return emptyCart(action.clientRequestId);
  }
}

export interface CartTotals {
  itemCount: number;
  subtotalKurus: number;
  discountKurus: number;
  totalKurus: number;
  discountError: string | null;
}

export function cartTotals(state: CartState): CartTotals {
  const subtotalKurus = state.lines.reduce((a, l) => a + l.unitPriceKurus * l.qty, 0);
  const itemCount = state.lines.reduce((a, l) => a + l.qty, 0);
  let discountKurus = 0;
  let discountError: string | null = null;
  try {
    discountKurus = resolveCartDiscount(subtotalKurus, state.discount);
  } catch {
    discountError = "İndirim ara toplamdan büyük olamaz.";
  }
  return { itemCount, subtotalKurus, discountKurus, totalKurus: subtotalKurus - discountKurus, discountError };
}

/** localStorage'dan okunan sepetin biçimini doğrular (bozuksa null). */
export function parseStoredCart(v: unknown): CartState | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Partial<CartState>;
  if (typeof c.clientRequestId !== "string" || !Array.isArray(c.lines)) return null;
  const lines = c.lines.filter(
    (l): l is CartLine =>
      !!l &&
      Number.isInteger(l.productId) &&
      typeof l.name === "string" &&
      Number.isInteger(l.unitPriceKurus) &&
      Number.isInteger(l.qty) &&
      l.qty > 0,
  );
  return {
    lines,
    clientRequestId: c.clientRequestId,
    discount: c.discount ?? null,
    selectedId: lines.at(-1)?.productId ?? null,
    flash: 0,
  };
}
