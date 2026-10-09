/**
 * Rapor sorguları (tarih aralığı, her iki uç dahil, iş günü = İstanbul).
 * Kurallar: iptal edilen satışlar HİÇ girmez; iadeler, iadenin yapıldığı günün ciro ve kârından düşülür.
 */
import { getIstanbulHour } from "@/lib/businessDate";
import { divRound, marginPermille } from "@/lib/money";
import type { DB } from "../types";

export interface PaymentBreakdown {
  saleCount: number;
  salesKurus: number;
  refundsKurus: number;
  /** satış − iade */
  netKurus: number;
}

export interface PeriodSummary {
  saleCount: number;
  voidedCount: number;
  returnCount: number;
  /** İndirim öncesi KDV dahil satış toplamı */
  subtotalKurus: number;
  discountKurus: number;
  /** Satışların KDV dahil toplamı (iadeler düşülmeden) */
  salesTotalKurus: number;
  refundsKurus: number;
  /** Ciro (KDV dahil) = satış − iade */
  revenueGrossKurus: number;
  /** Ciro (KDV hariç) */
  revenueNetKurus: number;
  vatKurus: number;
  costGrossKurus: number;
  costNetKurus: number;
  /** ANA KÂR: KDV hariç ciro − KDV hariç maliyet */
  grossProfitKurus: number;
  /** İkincil bilgi: KDV dahil ciro − KDV dahil maliyet */
  vatInclusiveDiffKurus: number;
  /** Binde; ciro 0 ise null */
  marginPermille: number | null;
  /** Ortalama sepet (KDV dahil, iadeler düşülmeden); satış yoksa null */
  avgBasketKurus: number | null;
  itemsSold: number;
  itemsReturned: number;
  cash: PaymentBreakdown;
  card: PaymentBreakdown;
}

interface SalesAgg {
  n: number;
  subtotal: number;
  discount: number;
  total: number;
  net: number;
  vat: number;
  cost: number;
  costNet: number;
  profit: number;
  cashTotal: number;
  cashCount: number;
  cardTotal: number;
  cardCount: number;
}

interface ReturnsAgg {
  n: number;
  refund: number;
  net: number;
  cost: number;
  costNet: number;
  profit: number;
  cashRefund: number;
  cardRefund: number;
}

export function getPeriodSummary(db: DB, from: string, to: string): PeriodSummary {
  const s = db
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(subtotal_kurus),0) AS subtotal, COALESCE(SUM(discount_kurus),0) AS discount,
              COALESCE(SUM(total_kurus),0) AS total, COALESCE(SUM(net_total_kurus),0) AS net,
              COALESCE(SUM(vat_total_kurus),0) AS vat, COALESCE(SUM(cost_total_kurus),0) AS cost,
              COALESCE(SUM(cost_net_total_kurus),0) AS costNet, COALESCE(SUM(gross_profit_kurus),0) AS profit,
              COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_kurus END),0) AS cashTotal,
              COALESCE(SUM(payment_method='cash'),0) AS cashCount,
              COALESCE(SUM(CASE WHEN payment_method='card' THEN total_kurus END),0) AS cardTotal,
              COALESCE(SUM(payment_method='card'),0) AS cardCount
         FROM sales WHERE status = 'completed' AND business_date BETWEEN ? AND ?`,
    )
    .get(from, to) as SalesAgg;
  const voidedCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM sales WHERE status = 'voided' AND business_date BETWEEN ? AND ?`).get(from, to) as {
      n: number;
    }
  ).n;
  const itemsSold = (
    db
      .prepare(
        `SELECT COALESCE(SUM(i.qty),0) AS q FROM sale_items i JOIN sales s ON s.id = i.sale_id
          WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?`,
      )
      .get(from, to) as { q: number }
  ).q;
  const r = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(refund_total_kurus),0) AS refund, COALESCE(SUM(net_total_kurus),0) AS net,
              COALESCE(SUM(cost_total_kurus),0) AS cost, COALESCE(SUM(cost_net_total_kurus),0) AS costNet,
              COALESCE(SUM(profit_reversal_kurus),0) AS profit,
              COALESCE(SUM(CASE WHEN refund_method='cash' THEN refund_total_kurus END),0) AS cashRefund,
              COALESCE(SUM(CASE WHEN refund_method='card' THEN refund_total_kurus END),0) AS cardRefund
         FROM returns WHERE business_date BETWEEN ? AND ?`,
    )
    .get(from, to) as ReturnsAgg;
  const itemsReturned = (
    db
      .prepare(
        `SELECT COALESCE(SUM(ri.qty),0) AS q FROM return_items ri JOIN returns r ON r.id = ri.return_id
          WHERE r.business_date BETWEEN ? AND ?`,
      )
      .get(from, to) as { q: number }
  ).q;

  const revenueGrossKurus = s.total - r.refund;
  const revenueNetKurus = s.net - r.net;
  const costGrossKurus = s.cost - r.cost;
  const costNetKurus = s.costNet - r.costNet;
  const grossProfitKurus = s.profit - r.profit;
  return {
    saleCount: s.n,
    voidedCount,
    returnCount: r.n,
    subtotalKurus: s.subtotal,
    discountKurus: s.discount,
    salesTotalKurus: s.total,
    refundsKurus: r.refund,
    revenueGrossKurus,
    revenueNetKurus,
    vatKurus: revenueGrossKurus - revenueNetKurus,
    costGrossKurus,
    costNetKurus,
    grossProfitKurus,
    vatInclusiveDiffKurus: revenueGrossKurus - costGrossKurus,
    marginPermille: marginPermille(grossProfitKurus, revenueNetKurus),
    avgBasketKurus: s.n > 0 ? divRound(s.total, s.n) : null,
    itemsSold: itemsSold - itemsReturned,
    itemsReturned,
    cash: { saleCount: s.cashCount, salesKurus: s.cashTotal, refundsKurus: r.cashRefund, netKurus: s.cashTotal - r.cashRefund },
    card: { saleCount: s.cardCount, salesKurus: s.cardTotal, refundsKurus: r.cardRefund, netKurus: s.cardTotal - r.cardRefund },
  };
}

export interface HourBucket {
  hour: number;
  saleCount: number;
  totalKurus: number;
}

/** Bir iş gününün saatlik satışları (İstanbul saati, 0–23). İptaller hariç. */
export function getHourlySales(db: DB, businessDate: string): HourBucket[] {
  const rows = db
    .prepare(`SELECT created_at AS createdAt, total_kurus AS total FROM sales WHERE status='completed' AND business_date = ?`)
    .all(businessDate) as { createdAt: string; total: number }[];
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, saleCount: 0, totalKurus: 0 }));
  for (const r of rows) {
    const b = buckets[getIstanbulHour(new Date(r.createdAt))]!;
    b.saleCount += 1;
    b.totalKurus += r.total;
  }
  return buckets;
}

export interface ProductAggregate {
  productId: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  qty: number;
  revenueGrossKurus: number;
  revenueNetKurus: number;
  costNetKurus: number;
  grossProfitKurus: number;
  marginPermille: number | null;
}

/** Ürün bazında satış − iade (iptaller hariç). Sadece hareket olan ürünler döner. */
export function getProductAggregates(db: DB, from: string, to: string): ProductAggregate[] {
  const sold = db
    .prepare(
      `SELECT i.product_id AS productId, SUM(i.qty) AS qty, SUM(i.line_total_kurus) AS gross,
              SUM(i.line_net_kurus) AS net, SUM(i.line_cost_net_kurus) AS costNet, SUM(i.line_profit_kurus) AS profit
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
        WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
        GROUP BY i.product_id`,
    )
    .all(from, to) as { productId: number; qty: number; gross: number; net: number; costNet: number; profit: number }[];
  const returned = db
    .prepare(
      `SELECT si.product_id AS productId, SUM(ri.qty) AS qty, SUM(ri.refund_kurus) AS gross,
              SUM(ri.net_kurus) AS net, SUM(ri.cost_net_kurus) AS costNet, SUM(ri.profit_reversal_kurus) AS profit
         FROM return_items ri
         JOIN returns r ON r.id = ri.return_id
         JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.business_date BETWEEN ? AND ?
        GROUP BY si.product_id`,
    )
    .all(from, to) as typeof sold;

  const acc = new Map<number, { qty: number; gross: number; net: number; costNet: number; profit: number }>();
  for (const x of sold) acc.set(x.productId, { ...x });
  for (const x of returned) {
    const a = acc.get(x.productId) ?? { qty: 0, gross: 0, net: 0, costNet: 0, profit: 0 };
    acc.set(x.productId, {
      qty: a.qty - x.qty,
      gross: a.gross - x.gross,
      net: a.net - x.net,
      costNet: a.costNet - x.costNet,
      profit: a.profit - x.profit,
    });
  }
  if (acc.size === 0) return [];
  const names = new Map(
    (
      db
        .prepare(
          `SELECT p.id, p.name, p.category_id AS categoryId, c.name AS categoryName
             FROM products p LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.id IN (${[...acc.keys()].map(() => "?").join(",")})`,
        )
        .all(...acc.keys()) as { id: number; name: string; categoryId: number | null; categoryName: string | null }[]
    ).map((p) => [p.id, p]),
  );
  return [...acc].map(([productId, a]) => {
    const p = names.get(productId);
    return {
      productId,
      name: p?.name ?? `#${productId}`,
      categoryId: p?.categoryId ?? null,
      categoryName: p?.categoryName ?? null,
      qty: a.qty,
      revenueGrossKurus: a.gross,
      revenueNetKurus: a.net,
      costNetKurus: a.costNet,
      grossProfitKurus: a.profit,
      marginPermille: marginPermille(a.profit, a.net),
    };
  });
}

export interface StockAlert {
  productId: number;
  name: string;
  stockQty: number;
  minStock: number;
}

/** Aktif ürünlerde kritik stok (0 < stok ≤ min) ve stoğu bitenler (stok ≤ 0). */
export function getStockAlerts(db: DB): { critical: StockAlert[]; outOfStock: StockAlert[] } {
  const rows = db
    .prepare(
      `SELECT id AS productId, name, stock_qty AS stockQty, min_stock AS minStock FROM products
        WHERE is_active = 1 AND stock_qty <= min_stock ORDER BY stock_qty, name`,
    )
    .all() as StockAlert[];
  return { critical: rows.filter((r) => r.stockQty > 0), outOfStock: rows.filter((r) => r.stockQty <= 0) };
}

export interface DaySaleRow {
  id: number;
  receiptNo: string;
  createdAt: string;
  status: "completed" | "voided";
  paymentMethod: "cash" | "card";
  totalKurus: number;
  grossProfitKurus: number;
  itemCount: number;
  returnCount: number;
  refundedKurus: number;
}

/** Bir iş gününün satış listesi (iptaller dahil, işaretli). */
export function listDaySales(db: DB, businessDate: string): DaySaleRow[] {
  return db
    .prepare(
      `SELECT s.id, s.receipt_no AS receiptNo, s.created_at AS createdAt, s.status, s.payment_method AS paymentMethod,
              s.total_kurus AS totalKurus, s.gross_profit_kurus AS grossProfitKurus,
              (SELECT COALESCE(SUM(qty),0) FROM sale_items WHERE sale_id = s.id) AS itemCount,
              (SELECT COUNT(*) FROM returns WHERE sale_id = s.id) AS returnCount,
              (SELECT COALESCE(SUM(refund_total_kurus),0) FROM returns WHERE sale_id = s.id) AS refundedKurus
         FROM sales s WHERE s.business_date = ? ORDER BY s.created_at DESC, s.id DESC`,
    )
    .all(businessDate) as DaySaleRow[];
}
