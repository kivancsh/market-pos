/** A4 etiket sayfası yerleşimi (mm). */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export interface LabelLayout {
  cols: number;
  rows: number;
  marginMm: number;
  cellWidthMm: number;
  cellHeightMm: number;
  perPage: number;
}

export function labelLayout(cols: number, rows: number, marginMm: number): LabelLayout {
  const c = Math.min(Math.max(Math.trunc(cols) || 1, 1), 10);
  const r = Math.min(Math.max(Math.trunc(rows) || 1, 1), 20);
  const m = Math.min(Math.max(marginMm || 0, 0), 30);
  return {
    cols: c,
    rows: r,
    marginMm: m,
    cellWidthMm: Math.round(((A4_WIDTH_MM - 2 * m) / c) * 10) / 10,
    cellHeightMm: Math.round(((A4_HEIGHT_MM - 2 * m) / r) * 10) / 10,
    perPage: c * r,
  };
}

/**
 * Etiketleri sayfalara böler. `skip`: kısmen kullanılmış ilk sayfada atlanacak (boş bırakılacak) etiket sayısı.
 * Boş hücreler null'dır.
 */
export function paginateLabels<T>(labels: T[], perPage: number, skip = 0): (T | null)[][] {
  const s = Math.min(Math.max(Math.trunc(skip) || 0, 0), perPage - 1);
  const cells: (T | null)[] = [...Array<null>(s).fill(null), ...labels];
  if (labels.length === 0) return [];
  const pages: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += perPage) {
    const page = cells.slice(i, i + perPage);
    while (page.length < perPage) page.push(null);
    pages.push(page);
  }
  return pages;
}
