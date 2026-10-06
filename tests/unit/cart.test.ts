import { describe, expect, it } from "vitest";
import { cartReducer, cartTotals, emptyCart, parseStoredCart } from "@/client/cart";
import type { CatalogItem } from "@/client/types";

const kola: CatalogItem = { id: 3, name: "Kola 1 L", salePriceKurus: 5000, vatRate: 20, stockQty: 48, minStock: 12, barcodes: ["2000000000039"], primaryBarcode: "2000000000039" };
const su: CatalogItem = { id: 1, name: "Su 0,5 L", salePriceKurus: 1000, vatRate: 1, stockQty: 120, minStock: 24, barcodes: ["2000000000015"], primaryBarcode: "2000000000015" };

describe("sepet", () => {
  it("aynı ürün tekrar okutulursa adet artar, yeni satır açılmaz", () => {
    let c = emptyCart("id-1");
    c = cartReducer(c, { type: "add", product: kola, barcode: "2000000000039" });
    c = cartReducer(c, { type: "add", product: su, barcode: null });
    c = cartReducer(c, { type: "add", product: kola, barcode: "8691000000033" });
    expect(c.lines.map((l) => [l.productId, l.qty, l.barcode])).toEqual([
      [3, 2, "2000000000039"],
      [1, 1, null],
    ]);
    expect(c.selectedId).toBe(3);
    expect(c.clientRequestId).toBe("id-1");
  });

  it("adet 1'in altına inmez; silme ve sıfırlama", () => {
    let c = cartReducer(emptyCart("a"), { type: "add", product: kola, barcode: null });
    c = cartReducer(c, { type: "setQty", productId: 3, qty: 0 });
    expect(c.lines[0]!.qty).toBe(1);
    c = cartReducer(c, { type: "remove", productId: 3 });
    expect(c.lines).toEqual([]);
    c = cartReducer(c, { type: "reset", clientRequestId: "b" });
    expect(c.clientRequestId).toBe("b");
  });

  it("toplamlar ve indirim (gösterim)", () => {
    let c = emptyCart("a");
    c = cartReducer(c, { type: "add", product: kola, barcode: null });
    c = cartReducer(c, { type: "setQty", productId: 3, qty: 3 });
    c = cartReducer(c, { type: "add", product: su, barcode: null });
    c = cartReducer(c, { type: "setDiscount", discount: { type: "percent", value: 10 } });
    expect(cartTotals(c)).toEqual({ itemCount: 4, subtotalKurus: 16000, discountKurus: 1600, totalKurus: 14400, discountError: null });
    c = cartReducer(c, { type: "setDiscount", discount: { type: "amount", value: 99999 } });
    expect(cartTotals(c).discountError).not.toBeNull();
  });

  it("katalog yenilenince fiyat/ad güncellenir", () => {
    let c = cartReducer(emptyCart("a"), { type: "add", product: kola, barcode: null });
    c = cartReducer(c, { type: "syncCatalog", byId: new Map([[3, { ...kola, salePriceKurus: 5500, name: "Kola 1L" }]]) });
    expect(c.lines[0]).toMatchObject({ unitPriceKurus: 5500, name: "Kola 1L" });
  });

  it("bozuk kayıtlı sepet yok sayılır", () => {
    expect(parseStoredCart(null)).toBeNull();
    expect(parseStoredCart({ lines: "x" })).toBeNull();
    const ok = parseStoredCart({ clientRequestId: "a", lines: [{ productId: 3, name: "K", unitPriceKurus: 5000, qty: 2 }, { bad: true }] });
    expect(ok?.lines).toHaveLength(1);
  });
});
