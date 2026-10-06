"use client";

import type { RefObject } from "react";
import { formatTRY } from "@/lib/money";
import type { CartState } from "@/client/cart";

export function CartTable({
  cart,
  loaded,
  qtyRefs,
  onQty,
  onRemove,
  onSelect,
  onDone,
}: {
  cart: CartState;
  loaded: boolean;
  qtyRefs: RefObject<Map<number, HTMLInputElement>>;
  onQty: (productId: number, qty: number) => void;
  onRemove: (productId: number) => void;
  onSelect: (productId: number) => void;
  onDone: () => void;
}) {
  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
        <div className="text-5xl" aria-hidden>
          ▮▯▮▮▯▮
        </div>
        <p className="mt-3 text-xl font-medium">{loaded ? "Sepet boş. Ürün okutun." : "Ürün listesi yükleniyor…"}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-base sm:text-lg" data-testid="cart-table">
        <thead className="sticky top-0 bg-slate-100 text-sm uppercase text-slate-600">
          <tr>
            <th className="px-3 py-2">Ürün</th>
            <th className="hidden px-3 py-2 text-right sm:table-cell">Birim</th>
            <th className="px-3 py-2 text-center">Adet</th>
            <th className="px-3 py-2 text-right">Tutar</th>
            <th className="px-2 py-2">
              <span className="sr-only">Sil</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cart.lines.map((l) => {
            const selected = l.productId === cart.selectedId;
            return (
              <tr
                key={selected ? `${l.productId}-${cart.flash}` : l.productId}
                onClick={() => onSelect(l.productId)}
                className={`border-t border-slate-100 ${selected ? "animate-row-flash outline-2 -outline-offset-2 outline-emerald-500" : ""}`}
                data-testid="cart-row"
                data-product-id={l.productId}
                aria-selected={selected}
              >
                <td className="px-2 py-2 sm:px-3">
                  <div className="font-semibold text-slate-900">{l.name}</div>
                  <div className="text-xs break-all text-slate-500">
                    {l.barcode ?? "elle seçildi"}
                    {l.qty > l.stockQty && (
                      <span className="ml-2 font-semibold text-amber-700">stokta {l.stockQty} görünüyor</span>
                    )}
                  </div>
                </td>
                <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{formatTRY(l.unitPriceKurus)}</td>
                <td className="px-1 py-2 sm:px-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (l.qty > 1) onQty(l.productId, l.qty - 1);
                        onDone();
                      }}
                      className="h-10 w-9 rounded-lg bg-slate-200 text-2xl font-bold active:bg-slate-300 sm:h-11 sm:w-11"
                      aria-label={`${l.name} adedini azalt`}
                    >
                      −
                    </button>
                    <input
                      ref={(el) => {
                        if (el) qtyRefs.current.set(l.productId, el);
                        else qtyRefs.current.delete(l.productId);
                      }}
                      inputMode="numeric"
                      value={l.qty}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ""));
                        if (n > 0) onQty(l.productId, n);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onDone();
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                      className="h-10 w-11 rounded-lg border border-slate-300 text-center text-lg font-bold tabular-nums sm:h-11 sm:w-16 sm:text-xl"
                      aria-label={`${l.name} adet`}
                      data-testid="qty-input"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQty(l.productId, l.qty + 1);
                        onDone();
                      }}
                      className="h-10 w-9 rounded-lg bg-slate-200 text-2xl font-bold active:bg-slate-300 sm:h-11 sm:w-11"
                      aria-label={`${l.name} adedini artır`}
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="px-1 py-2 text-right font-semibold whitespace-nowrap tabular-nums sm:px-3">{formatTRY(l.unitPriceKurus * l.qty)}</td>
                <td className="px-1 py-2 text-right sm:px-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(l.productId);
                    }}
                    className="h-10 w-8 rounded-lg text-xl text-red-700 hover:bg-red-50 sm:h-11 sm:w-11"
                    aria-label={`${l.name} satırını sil`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
