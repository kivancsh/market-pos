/**
 * Excel'den ürün içe aktarma: önizleme (doğrulama) ve onay (tek transaction).
 * Hatalı satırlar içe aktarılmaz; geçerli satırların hepsi birlikte yazılır ya da hiçbiri.
 */
import { validateBarcodeForStorage } from "@/lib/barcode";
import { parseTRYToKurus } from "@/lib/money";
import type { Ctx } from "../context";
import { findBarcode } from "../db/repositories/barcodes";
import { listCategories } from "../db/repositories/categories";
import { getProductById, listProducts } from "../db/repositories/products";
import type { RawCell, RawImportRow } from "../excel";
import { audit } from "./audit";
import { createProduct } from "./products";

export interface ImportPreviewRow {
  rowNumber: number;
  barcode: string | null;
  name: string;
  categoryName: string | null;
  costKurus: number | null;
  priceKurus: number | null;
  vatRate: number | null;
  stock: number | null;
  minStock: number | null;
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  validCount: number;
  errorCount: number;
}

const text = (c: RawCell) => (c === null ? "" : String(c).trim());

/** Excel sayısı → kuruş (metin üzerinden; en fazla 2 ondalık). */
export function numberToKurus(n: number): number | null {
  if (!Number.isFinite(n) || n < 0) return null;
  const s = String(n);
  if (/e/i.test(s)) return null;
  const [i, f = ""] = s.split(".");
  if (f.length > 2) return null;
  const v = Number(i) * 100 + Number(f.padEnd(2, "0"));
  return Number.isSafeInteger(v) ? v : null;
}

export function cellToKurus(c: RawCell): number | null {
  if (c === null || text(c) === "") return null;
  return typeof c === "number" ? numberToKurus(c) : parseTRYToKurus(c);
}

export function cellToInt(c: RawCell): number | null {
  if (c === null || text(c) === "") return null;
  if (typeof c === "number") return Number.isSafeInteger(c) && c >= 0 ? c : NaN;
  const t = text(c);
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

export function cellToVat(c: RawCell): number | null {
  if (c === null || text(c) === "") return null;
  const t = text(c).replace("%", "").replace(",", ".");
  const map: Record<string, number> = { "1": 1, "10": 10, "20": 20, "0.01": 1, "0.1": 10, "0.2": 20 };
  return map[t] ?? NaN;
}

export function cellToBarcode(c: RawCell): { code: string | null; error?: string } {
  if (c === null || text(c) === "") return { code: null };
  if (typeof c === "number") {
    if (!Number.isSafeInteger(c) || c < 0) return { code: null, error: "Barkod Excel'de sayıya dönüşüp bozulmuş; hücreyi metin yapıp tekrar yazın." };
    return { code: String(c) };
  }
  return { code: text(c) };
}

export function previewImport(ctx: Ctx, raw: RawImportRow[]): ImportPreview {
  const existingNames = new Set(listProducts(ctx.db).map((p) => p.name.toLocaleLowerCase("tr")));
  const existingCategories = new Set(listCategories(ctx.db).map((c) => c.name.toLocaleLowerCase("tr")));
  const rows: ImportPreviewRow[] = raw.map(({ rowNumber, cells }) => {
    const [bc, nm, cat, cost, price, vat, stock, min] = cells;
    const errors: string[] = [];
    const warnings: string[] = [];

    const b = cellToBarcode(bc ?? null);
    let barcode = b.code;
    if (b.error) errors.push(b.error);
    else if (barcode) {
      const v = validateBarcodeForStorage(barcode);
      if (!v.ok) errors.push(v.message);
      else {
        barcode = v.code;
        const ex = findBarcode(ctx.db, barcode);
        if (ex) errors.push(`Barkod zaten "${getProductById(ctx.db, ex.productId)?.name}" ürününe ait.`);
      }
    }

    const name = text(nm ?? null);
    if (!name) errors.push("Ürün adı boş.");
    else if (name.length > 120) errors.push("Ürün adı en fazla 120 karakter olabilir.");
    else if (existingNames.has(name.toLocaleLowerCase("tr"))) warnings.push("Bu adda bir ürün zaten var (yine de eklenecek).");

    const categoryName = text(cat ?? null) || null;
    if (categoryName && categoryName.length > 60) errors.push("Kategori adı en fazla 60 karakter olabilir.");
    else if (categoryName && !existingCategories.has(categoryName.toLocaleLowerCase("tr"))) warnings.push(`Yeni kategori oluşturulacak: ${categoryName}`);

    const priceKurus = cellToKurus(price ?? null);
    if (priceKurus === null) errors.push(text(price ?? null) ? "Satış fiyatı hatalı (ör. 12,50)." : "Satış fiyatı boş.");
    const costRaw = cellToKurus(cost ?? null);
    const costKurus = text(cost ?? null) === "" ? 0 : costRaw;
    if (costKurus === null) errors.push("Alış fiyatı hatalı (ör. 8,75).");

    const vatRaw = cellToVat(vat ?? null);
    const vatRate = vatRaw === null ? 20 : vatRaw;
    if (Number.isNaN(vatRate)) errors.push("KDV sadece 1, 10 veya 20 olabilir.");

    const stockRaw = cellToInt(stock ?? null);
    const stockN = stockRaw === null ? 0 : stockRaw;
    if (Number.isNaN(stockN)) errors.push("Stok tam sayı olmalı.");
    const minRaw = cellToInt(min ?? null);
    const minN = minRaw === null ? 0 : minRaw;
    if (Number.isNaN(minN)) errors.push("Min stok tam sayı olmalı.");

    if (priceKurus !== null && costKurus !== null && costKurus > 0 && priceKurus < costKurus) {
      warnings.push("Satış fiyatı alış fiyatının altında.");
    }
    if (!barcode && errors.length === 0) warnings.push("Barkod boş: dükkân içi barkod üretilecek.");

    return {
      rowNumber,
      barcode,
      name,
      categoryName,
      costKurus,
      priceKurus,
      vatRate: Number.isNaN(vatRate) ? null : vatRate,
      stock: Number.isNaN(stockN) ? null : stockN,
      minStock: Number.isNaN(minN) ? null : minN,
      errors,
      warnings,
    };
  });

  // Dosya içinde tekrarlanan barkodlar: hepsi reddedilir
  const counts = new Map<string, number[]>();
  for (const r of rows) if (r.barcode) counts.set(r.barcode, [...(counts.get(r.barcode) ?? []), r.rowNumber]);
  for (const r of rows) {
    const same = r.barcode ? counts.get(r.barcode)! : [];
    if (same.length > 1) r.errors.push(`Barkod dosyada tekrarlanıyor (satır ${same.join(", ")}).`);
  }

  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  return { rows, validCount: rows.length - errorCount, errorCount };
}

export interface ImportResult {
  created: { rowNumber: number; productId: number; name: string; barcode: string | null }[];
  skipped: number;
}

/** Geçerli satırları tek transaction'da ürün olarak ekler (barkodsuzlara dükkân içi barkod üretilir). */
export function commitImport(ctx: Ctx, raw: RawImportRow[]): ImportResult {
  return ctx.db
    .transaction((): ImportResult => {
      const preview = previewImport(ctx, raw);
      const valid = preview.rows.filter((r) => r.errors.length === 0);
      const created = valid.map((r) => {
        const p = createProduct(ctx, {
          name: r.name,
          categoryName: r.categoryName,
          salePriceKurus: r.priceKurus!,
          costPriceKurus: r.costKurus!,
          vatRate: r.vatRate as 1 | 10 | 20,
          initialStock: r.stock!,
          minStock: r.minStock!,
          barcodes: r.barcode ? [{ barcode: r.barcode, type: "manufacturer" }] : [],
          generateBarcodeIfMissing: true,
        });
        return { rowNumber: r.rowNumber, productId: p.id, name: p.name, barcode: p.barcodes.find((b) => b.isPrimary)?.barcode ?? null };
      });
      audit(ctx, "product.import", `Excel'den ${created.length} ürün eklendi${preview.errorCount ? `, ${preview.errorCount} hatalı satır atlandı` : ""}`);
      return { created, skipped: preview.errorCount };
    })
    .immediate();
}
