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
  userName: string | null;
}

/** Bir iş gününün satış listesi (iptaller dahil, işaretli). */
export function listDaySales(db: DB, businessDate: string): DaySaleRow[] {
  return db
    .prepare(
      `SELECT s.id, s.receipt_no AS receiptNo, s.created_at AS createdAt, s.status, s.payment_method AS paymentMethod,
              s.total_kurus AS totalKurus, s.gross_profit_kurus AS grossProfitKurus, s.user_name AS userName,
              (SELECT COALESCE(SUM(qty),0) FROM sale_items WHERE sale_id = s.id) AS itemCount,
              (SELECT COUNT(*) FROM returns WHERE sale_id = s.id) AS returnCount,
              (SELECT COALESCE(SUM(refund_total_kurus),0) FROM returns WHERE sale_id = s.id) AS refundedKurus
         FROM sales s WHERE s.business_date = ? ORDER BY s.created_at DESC, s.id DESC`,
    )
    .all(businessDate) as DaySaleRow[];
}

export interface DailyRow {
  businessDate: string;
  saleCount: number;
  returnCount: number;
  revenueGrossKurus: number;
  revenueNetKurus: number;
  grossProfitKurus: number;
  marginPermille: number | null;
  refundsKurus: number;
}

/** Gün gün özet (satışsız günler 0 ile). */
export function getDailyRows(db: DB, days: string[]): DailyRow[] {
  if (days.length === 0) return [];
  const from = days[0]!;
  const to = days[days.length - 1]!;
  const sales = new Map(
    (
      db
        .prepare(
          `SELECT business_date AS d, COUNT(*) AS n, SUM(total_kurus) AS gross, SUM(net_total_kurus) AS net,
                  SUM(gross_profit_kurus) AS profit
             FROM sales WHERE status='completed' AND business_date BETWEEN ? AND ? GROUP BY business_date`,
        )
        .all(from, to) as { d: string; n: number; gross: number; net: number; profit: number }[]
    ).map((r) => [r.d, r]),
  );
  const rets = new Map(
    (
      db
        .prepare(
          `SELECT business_date AS d, COUNT(*) AS n, SUM(refund_total_kurus) AS gross, SUM(net_total_kurus) AS net,
                  SUM(profit_reversal_kurus) AS profit
             FROM returns WHERE business_date BETWEEN ? AND ? GROUP BY business_date`,
        )
        .all(from, to) as { d: string; n: number; gross: number; net: number; profit: number }[]
    ).map((r) => [r.d, r]),
  );
  return days.map((d) => {
    const s = sales.get(d);
    const r = rets.get(d);
    const net = (s?.net ?? 0) - (r?.net ?? 0);
    const profit = (s?.profit ?? 0) - (r?.profit ?? 0);
    return {
      businessDate: d,
      saleCount: s?.n ?? 0,
      returnCount: r?.n ?? 0,
      revenueGrossKurus: (s?.gross ?? 0) - (r?.gross ?? 0),
      revenueNetKurus: net,
      grossProfitKurus: profit,
      marginPermille: marginPermille(profit, net),
      refundsKurus: r?.gross ?? 0,
    };
  });
}

export interface ActiveProductRow {
  id: number;
  name: string;
  categoryName: string | null;
  salePriceKurus: number;
  avgCostKurus: number;
  vatRate: number;
  stockQty: number;
}

export function listActiveProductRows(db: DB): ActiveProductRow[] {
  return db
    .prepare(
      `SELECT p.id, p.name, c.name AS categoryName, p.sale_price_kurus AS salePriceKurus, p.avg_cost_kurus AS avgCostKurus,
              p.vat_rate AS vatRate, p.stock_qty AS stockQty
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1 ORDER BY p.name COLLATE NOCASE`,
    )
    .all() as ActiveProductRow[];
}

/** Ürün başına son (iptal edilmemiş) satış günü. */
export function getLastSaleDates(db: DB): Map<number, string> {
  const rows = db
    .prepare(
      `SELECT i.product_id AS productId, MAX(s.business_date) AS last
         FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.status='completed' GROUP BY i.product_id`,
    )
    .all() as { productId: number; last: string }[];
  return new Map(rows.map((r) => [r.productId, r.last]));
}

// ------------------------------------------------------------------ kasiyer performansı

export interface CashierAggregate {
  /** Satışı yapan kullanıcı (eski satışlarda boş olabilir) */
  userId: number | null;
  name: string;
  role: "owner" | "cashier" | null;
  cashierNo: number | null;
  isActive: boolean;
  saleCount: number;
  /** Tamamlanan satışların KDV dahil toplamı (iadeler düşülmeden) */
  salesTotalKurus: number;
  salesNetKurus: number;
  discountKurus: number;
  /** Satışlarının brüt kârı − bu satışlardan yapılan iadelerin kâr payı */
  grossProfitKurus: number;
  cashKurus: number;
  cardKurus: number;
  itemsSold: number;
  voidCount: number;
  voidTotalKurus: number;
  /** Bu kasiyerin satışlarından (aralıkta) yapılan iadeler */
  returnCount: number;
  refundKurus: number;
  refundNetKurus: number;
  activeDays: number;
  /** Her gün ilk satıştan son satışa geçen süre (dakika, toplam) */
  activeMinutes: number;
}

/**
 * Kasiyer (ve satış yapan yönetici) başına satış özeti. Aralıkta hiç satış yapmamış aktif kasiyerler de sıfırla listelenir.
 * İptal edilen satışlar ciroya girmez, ayrıca sayılır; iadeler, iadenin yapıldığı gün aralıktaysa satışı yapanın hanesine yazılır.
 */
/** Grup anahtarı: kullanıcı kaydı olan satışlar kullanıcıya, olmayanlar (eski/örnek veri) kasiyer adına göre. */
function keyOf(userId: number | null, userName: string | null): string {
  return userId !== null ? `u:${userId}` : `n:${userName ?? ""}`;
}

export function getCashierAggregates(db: DB, from: string, to: string): CashierAggregate[] {
  const sales = db
    .prepare(
      `SELECT s.user_id AS userId, MAX(s.user_name) AS userName,
              COALESCE(SUM(s.status = 'completed'), 0) AS saleCount,
              COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.total_kurus END), 0) AS total,
              COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.net_total_kurus END), 0) AS net,
              COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.discount_kurus END), 0) AS discount,
              COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.gross_profit_kurus END), 0) AS profit,
              COALESCE(SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'cash' THEN s.total_kurus END), 0) AS cash,
              COALESCE(SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'card' THEN s.total_kurus END), 0) AS card,
              COALESCE(SUM(s.status = 'voided'), 0) AS voidCount,
              COALESCE(SUM(CASE WHEN s.status = 'voided' THEN s.total_kurus END), 0) AS voidTotal,
              COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.business_date END) AS activeDays
         FROM sales s WHERE s.business_date BETWEEN ? AND ?
        GROUP BY s.user_id, CASE WHEN s.user_id IS NULL THEN s.user_name END`,
    )
    .all(from, to) as {
    userId: number | null;
    userName: string | null;
    saleCount: number;
    total: number;
    net: number;
    discount: number;
    profit: number;
    cash: number;
    card: number;
    voidCount: number;
    voidTotal: number;
    activeDays: number;
  }[];
  const items = new Map(
    (
      db
        .prepare(
          `SELECT s.user_id AS userId, s.user_name AS userName, COALESCE(SUM(i.qty), 0) AS q FROM sale_items i JOIN sales s ON s.id = i.sale_id
            WHERE s.status = 'completed' AND s.business_date BETWEEN ? AND ?
            GROUP BY s.user_id, CASE WHEN s.user_id IS NULL THEN s.user_name END`,
        )
        .all(from, to) as { userId: number | null; userName: string | null; q: number }[]
    ).map((r) => [keyOf(r.userId, r.userName), r.q]),
  );
  const returns = new Map(
    (
      db
        .prepare(
          `SELECT s.user_id AS userId, s.user_name AS userName, COUNT(*) AS n, COALESCE(SUM(r.refund_total_kurus), 0) AS refund,
                  COALESCE(SUM(r.net_total_kurus), 0) AS net, COALESCE(SUM(r.profit_reversal_kurus), 0) AS profit,
                  COALESCE(SUM((SELECT SUM(ri.qty) FROM return_items ri WHERE ri.return_id = r.id)), 0) AS qty
             FROM returns r JOIN sales s ON s.id = r.sale_id WHERE r.business_date BETWEEN ? AND ?
            GROUP BY s.user_id, CASE WHEN s.user_id IS NULL THEN s.user_name END`,
        )
        .all(from, to) as { userId: number | null; userName: string | null; n: number; refund: number; net: number; profit: number; qty: number }[]
    ).map((r) => [keyOf(r.userId, r.userName), r]),
  );
  const spans = db
    .prepare(
      `SELECT user_id AS userId, user_name AS userName, MIN(created_at) AS first, MAX(created_at) AS last FROM sales
        WHERE status = 'completed' AND business_date BETWEEN ? AND ?
        GROUP BY user_id, CASE WHEN user_id IS NULL THEN user_name END, business_date`,
    )
    .all(from, to) as { userId: number | null; userName: string | null; first: string; last: string }[];
  const minutes = new Map<string, number>();
  for (const s of spans) {
    const k = keyOf(s.userId, s.userName);
    const m = Math.round((Date.parse(s.last) - Date.parse(s.first)) / 60_000);
    minutes.set(k, (minutes.get(k) ?? 0) + Math.max(0, m));
  }
  const users = new Map(
    (
      db.prepare("SELECT id, name, role, cashier_no AS cashierNo, is_active AS isActive FROM users").all() as {
        id: number;
        name: string;
        role: "owner" | "cashier";
        cashierNo: number | null;
        isActive: number;
      }[]
    ).map((u) => [u.id, u]),
  );

  const out = new Map<string, CashierAggregate>();
  const base = (userId: number | null, fallbackName: string | null): CashierAggregate => {
    const u = userId !== null ? users.get(userId) : undefined;
    return {
      userId,
      name: u?.name ?? fallbackName ?? "Bilinmiyor (eski satış)",
      role: u?.role ?? null,
      cashierNo: u?.cashierNo ?? null,
      isActive: u ? u.isActive === 1 : false,
      saleCount: 0,
      salesTotalKurus: 0,
      salesNetKurus: 0,
      discountKurus: 0,
      grossProfitKurus: 0,
      cashKurus: 0,
      cardKurus: 0,
      itemsSold: 0,
      voidCount: 0,
      voidTotalKurus: 0,
      returnCount: 0,
      refundKurus: 0,
      refundNetKurus: 0,
      activeDays: 0,
      activeMinutes: 0,
    };
  };
  for (const s of sales) {
    const k = keyOf(s.userId, s.userName);
    const a = base(s.userId, s.userName);
    const r = returns.get(k);
    Object.assign(a, {
      saleCount: s.saleCount,
      salesTotalKurus: s.total,
      salesNetKurus: s.net,
      discountKurus: s.discount,
      grossProfitKurus: s.profit - (r?.profit ?? 0),
      cashKurus: s.cash,
      cardKurus: s.card,
      itemsSold: (items.get(k) ?? 0) - (r?.qty ?? 0),
      voidCount: s.voidCount,
      voidTotalKurus: s.voidTotal,
      returnCount: r?.n ?? 0,
      refundKurus: r?.refund ?? 0,
      refundNetKurus: r?.net ?? 0,
      activeDays: s.activeDays,
      activeMinutes: minutes.get(k) ?? 0,
    });
    out.set(k, a);
  }
  // Aralık dışında satılmış ama aralıkta iadesi olan satışlar
  for (const [k, r] of returns) {
    if (out.has(k)) continue;
    const a = base(r.userId, r.userName);
    Object.assign(a, { grossProfitKurus: -r.profit, itemsSold: -r.qty, returnCount: r.n, refundKurus: r.refund, refundNetKurus: r.net });
    out.set(k, a);
  }
  // Hiç satışı olmayan aktif kasiyerler
  for (const u of users.values()) {
    if (u.role === "cashier" && u.isActive === 1 && !out.has(keyOf(u.id, null))) out.set(keyOf(u.id, null), base(u.id, null));
  }
  return [...out.values()].sort((a, b) => b.salesTotalKurus - a.salesTotalKurus || a.name.localeCompare(b.name, "tr"));
}

// ------------------------------------------------------------------ analizler

/** Tamamlanan satışların zamanı ve tutarı (yoğunluk haritası için). */
export function getSaleTimes(db: DB, from: string, to: string): { createdAt: string; totalKurus: number }[] {
  return db
    .prepare(`SELECT created_at AS createdAt, total_kurus AS totalKurus FROM sales WHERE status = 'completed' AND business_date BETWEEN ? AND ?`)
    .all(from, to) as { createdAt: string; totalKurus: number }[];
}

export interface StockPlanRow {
  id: number;
  name: string;
  categoryName: string | null;
  stockQty: number;
  minStock: number;
  avgCostKurus: number;
}

/** Aktif ürünlerin stok ve asgari stok bilgisi (sipariş önerisi için). */
export function listStockPlanRows(db: DB): StockPlanRow[] {
  return db
    .prepare(
      `SELECT p.id, p.name, c.name AS categoryName, p.stock_qty AS stockQty, p.min_stock AS minStock, p.avg_cost_kurus AS avgCostKurus
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1 ORDER BY p.name COLLATE NOCASE`,
    )
    .all() as StockPlanRow[];
}
