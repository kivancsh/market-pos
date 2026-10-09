/**
 * Excel (xlsx) üretimi ve okuma. Para hesapları kuruşla yapılır; Excel'e yazarken TL'ye çevrilir
 * (yalnızca GÖSTERİM içindir: hücre sayısal kalsın ki Excel'de toplama/filtreleme yapılabilsin).
 */
import ExcelJS from "exceljs";
import { formatBusinessDate } from "@/lib/businessDate";
import type { ReportColumn, ReportResult, ReportRow } from "./services/reports";

const MONEY_FMT = '#,##0.00 "₺"';
const PERCENT_FMT = "0.0%";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

/** Kuruş → TL sayısı (Excel hücresi için). Metin üzerinden çevrilir; ara hesapta float kullanılmaz. */
export function kurusToExcelNumber(kurus: number): number {
  const neg = kurus < 0;
  const abs = Math.abs(kurus);
  return Number(`${neg ? "-" : ""}${(abs - (abs % 100)) / 100}.${String(abs % 100).padStart(2, "0")}`);
}

/** Binde → Excel yüzde sayısı (234 → 0,234 → "%23,4"). Metin üzerinden çevrilir. */
export function permilleToExcelNumber(pm: number): number {
  const neg = pm < 0;
  const abs = Math.abs(pm);
  return Number(`${neg ? "-" : ""}${(abs - (abs % 1000)) / 1000}.${String(abs % 1000).padStart(3, "0")}`);
}

function cellValue(col: ReportColumn, v: string | number | null): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  switch (col.type) {
    case "money":
      return typeof v === "number" ? kurusToExcelNumber(v) : v;
    case "permille":
      return typeof v === "number" ? permilleToExcelNumber(v) : v;
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatBusinessDate(v) : v;
    default:
      return v;
  }
}

function widthFor(col: ReportColumn): number {
  if (col.type === "text") return Math.max(col.label.length + 2, 28);
  if (col.type === "money") return Math.max(col.label.length + 2, 16);
  return Math.max(col.label.length + 2, 12);
}

export async function reportToXlsx(report: ReportResult, businessName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = businessName;
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));

  // Başlık satırları
  const period = report.usesRange
    ? `${formatBusinessDate(report.from)} – ${formatBusinessDate(report.to)}`
    : `${formatBusinessDate(report.to)} itibarıyla`;
  ws.addRow([`${businessName} — ${report.title}`]).font = { bold: true, size: 14 };
  ws.addRow([period]);
  ws.addRow([report.description]).font = { italic: true, color: { argb: "FF475569" } };
  ws.addRow([]);

  const headerRow = ws.addRow(report.columns.map((c) => c.label));
  headerRow.font = { bold: true };
  headerRow.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.border = { bottom: { style: "thin" } };
  });
  const headerIndex = headerRow.number;

  const addDataRow = (r: ReportRow, bold = false) => {
    const row = ws.addRow(report.columns.map((c) => cellValue(c, r[c.key] ?? null)));
    if (bold) row.font = { bold: true };
    return row;
  };
  for (const r of report.rows) addDataRow(r);
  if (report.totals) {
    const t = addDataRow(report.totals, true);
    t.eachCell((c) => (c.border = { top: { style: "thin" } }));
  }

  report.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = widthFor(c);
    if (c.type === "money") col.numFmt = MONEY_FMT;
    if (c.type === "permille") col.numFmt = PERCENT_FMT;
    if (c.type === "int") col.numFmt = "#,##0";
  });
  ws.views = [{ state: "frozen", ySplit: headerIndex }];
  if (report.rows.length > 0) {
    ws.autoFilter = { from: { row: headerIndex, column: 1 }, to: { row: headerIndex + report.rows.length, column: report.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Excel dosya adı için güvenli (ASCII) metin. */
export function asciiSlug(s: string): string {
  // ı (noktasız i) ayrışmaz; diğer aksanlar (ç, ş, ğ, ö, ü, â, î, û, İ) NFD ile harf + işarete ayrılıp işaret atılır.
  return s
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function xlsxResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/* ---------------------------- Ürün içe aktarma ---------------------------- */

export const IMPORT_HEADERS = [
  "Barkod",
  "Ürün adı",
  "Kategori",
  "Alış fiyatı (KDV dahil)",
  "Satış fiyatı (KDV dahil)",
  "KDV (%)",
  "Stok",
  "Min stok",
] as const;

export async function importTemplateXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ürünler");
  const header = ws.addRow([...IMPORT_HEADERS]);
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = HEADER_FILL));
  const widths = [18, 32, 18, 22, 22, 10, 10, 10];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  // Barkod sütunu METİN: Excel uzun sayıları bozmasın / baştaki 0'ı silmesin.
  ws.getColumn(1).numFmt = "@";
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const help = wb.addWorksheet("Açıklama");
  help.getColumn(1).width = 110;
  for (const line of [
    "ÜRÜN İÇE AKTARMA ŞABLONU",
    "",
    "• Ürünleri 'Ürünler' sayfasına, başlık satırının altına yazın. Başlıkları değiştirmeyin.",
    "• Barkod: boş bırakılırsa sistem dükkân içi barkod (200…) üretir. Aynı barkod iki satırda olamaz; sistemde kayıtlı barkod tekrar kullanılamaz.",
    "• Barkod sütunu metin biçimindedir; Excel uzun sayıları 4,00638E+12 gibi gösterirse hücreyi metin yapın.",
    "• Ürün adı ve satış fiyatı zorunludur.",
    "• Fiyatlar KDV DAHİL yazılır: 12,50 veya 12.50 (en fazla 2 kuruş hanesi).",
    "• KDV: 1, 10 veya 20 (boşsa 20).",
    "• Stok ve Min stok: tam sayı (boşsa 0). Stok, başlangıç stoğu olarak kaydedilir.",
    "• Kategori sistemde yoksa otomatik oluşturulur.",
    "• Yükledikten sonra önizleme gösterilir; hatalı satırlar kırmızıdır ve içe aktarılmaz.",
  ]) {
    help.addRow([line]);
  }
  help.getRow(1).font = { bold: true, size: 14 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type RawCell = string | number | null;

/** Hücre değerini sade metin/sayıya çevirir (zengin metin, formül sonucu, köprü vb.). */
function normalizeCell(v: ExcelJS.CellValue): RawCell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return normalizeCell(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return String(v);
}

export interface RawImportRow {
  rowNumber: number;
  cells: RawCell[];
}

export const MAX_IMPORT_ROWS = 2000;

/** Yüklenen xlsx'in ilk sayfasını okur; başlık satırını doğrular. */
export async function readImportFile(data: ArrayBuffer): Promise<RawImportRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(data) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    throw new Error("Dosya okunamadı. Lütfen şablondan oluşturulmuş bir .xlsx dosyası yükleyin.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Dosyada sayfa bulunamadı.");
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((v) => String(normalizeCell(v) ?? "").trim());
  const missing = IMPORT_HEADERS.filter((h, i) => header[i]?.toLocaleLowerCase("tr") !== h.toLocaleLowerCase("tr"));
  if (missing.length > 0) {
    throw new Error(`Başlık satırı şablonla uyuşmuyor (beklenen: ${IMPORT_HEADERS.join(" | ")}). Lütfen şablonu indirip kullanın.`);
  }
  const rows: RawImportRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = IMPORT_HEADERS.map((_, i) => normalizeCell(row.getCell(i + 1).value));
    if (cells.every((c) => c === null || String(c).trim() === "")) return;
    rows.push({ rowNumber, cells });
  });
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Tek seferde en fazla ${MAX_IMPORT_ROWS} satır içe aktarılabilir.`);
  return rows;
}
