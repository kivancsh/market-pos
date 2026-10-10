/**
 * Örnek veri üretimi. Bütün kayıtlar GERÇEK servislerden geçer (ürün, satış, iptal, iade, mal girişi),
 * böylece tüm hesaplar ve stok hareketleri tutarlıdır.
 *
 * Yöntem:
 *  1. Son 14 günün satışları (bugün dahil, şu ana kadar) rastgele ama tekrarlanabilir şekilde planlanır.
 *  2. Her ürün için zamanda GERİYE doğru yürünür: bugünkü stok tablodaki değer olacak şekilde
 *     14 gün önceki başlangıç stoğu ve gerektiğinde sabah mal girişleri hesaplanır.
 *  3. Her şey zaman sırasıyla, saat (ctx.now) o ana ayarlanarak servislerden geçirilir.
 */
import { randomUUID } from "node:crypto";
import { calcEan13CheckDigit } from "@/lib/barcode";
import { addDays, getBusinessDate, getIstanbulHour, istanbulLocalToUtc } from "@/lib/businessDate";
import { parseTRYToKurus } from "@/lib/money";
import { resolveCartDiscount, type CartDiscount } from "@/lib/pricing";
import type { Ctx } from "../context";
import type { DB } from "../db/types";
import { listBarcodesByProduct } from "../db/repositories/barcodes";
import { getProductById } from "../db/repositories/products";
import { saveSettings } from "../db/repositories/settings";
import { addBarcodeToProduct } from "../services/barcodes";
import { createProduct } from "../services/products";
import { createPurchase } from "../services/purchases";
import { createReturn } from "../services/returns";
import { completeSale } from "../services/sales";
import { voidSale } from "../services/voids";
import { MANUFACTURER_BARCODE_BODIES, SEED_PRODUCTS, SUPPLIERS, type SeedProduct } from "./data";

export const HISTORY_DAYS = 14;

/** Tekrarlanabilir rastgele sayı üreteci (mulberry32). */
function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pickWeighted = <T>(items: readonly T[], weight: (x: T) => number): T => {
    const total = items.reduce((s, x) => s + weight(x), 0);
    let r = next() * total;
    for (const x of items) {
      r -= weight(x);
      if (r < 0) return x;
    }
    return items[items.length - 1]!;
  };
  return { next, int, pickWeighted, chance: (p: number) => next() < p };
}
type Rng = ReturnType<typeof createRng>;

const HOUR_WEIGHTS: [number, number][] = [
  [9, 2], [10, 3], [11, 4], [12, 8], [13, 9], [14, 5], [15, 4],
  [16, 4], [17, 6], [18, 9], [19, 10], [20, 8], [21, 5],
];
const BASKET_SIZE_WEIGHTS: [number, number][] = [[1, 35], [2, 25], [3, 18], [4, 12], [5, 6], [6, 4]];

interface PlannedItem {
  p: number; // SEED_PRODUCTS indeksi
  qty: number;
  useManufacturerBarcode: boolean;
}

interface PlannedSale {
  key: number;
  at: Date;
  day: string;
  items: PlannedItem[];
  payment: "cash" | "card";
  tenderStep: number | null; // nakitte verilen paranın yuvarlandığı birim (kuruş); null = tam tutar
  discount: CartDiscount | null;
  role: "owner" | "cashier";
  voidAt?: Date;
  returnAt?: Date;
}

interface StockEvent {
  at: number;
  p: number;
  change: number;
}

function kurus(tl: string): number {
  const v = parseTRYToKurus(tl);
  if (v === null) throw new Error(`Geçersiz tutar: ${tl}`);
  return v;
}

function planSales(rng: Rng, days: string[], now: Date): PlannedSale[] {
  const sales: PlannedSale[] = [];
  let key = 0;
  for (const day of days) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const count = Math.min(40, rng.int(15, 32) + (weekend ? rng.int(3, 8) : 0));
    const daySales: PlannedSale[] = [];
    for (let i = 0; i < count; i++) {
      const hour = rng.pickWeighted(HOUR_WEIGHTS, (h) => h[1])[0];
      const at = istanbulLocalToUtc(day, hour, rng.int(0, 59), rng.int(0, 59));
      const size = rng.pickWeighted(BASKET_SIZE_WEIGHTS, (s) => s[1])[0];
      const chosen = new Set<number>();
      while (chosen.size < size) {
        chosen.add(SEED_PRODUCTS.indexOf(rng.pickWeighted(SEED_PRODUCTS, (x) => x.weight)));
      }
      const items: PlannedItem[] = [...chosen].map((p) => {
        const sp = SEED_PRODUCTS[p]!;
        const qty = sp.maxQty === 1 || rng.chance(0.65) ? 1 : rng.int(2, sp.maxQty);
        return { p, qty, useManufacturerBarcode: sp.no in MANUFACTURER_BARCODE_BODIES && rng.chance(0.6) };
      });
      const payment = rng.chance(0.7) ? "card" : "cash";
      const discounted = rng.chance(0.04);
      daySales.push({
        key: 0,
        at,
        day,
        items,
        payment,
        tenderStep: payment === "cash" && rng.chance(0.7) ? rng.pickWeighted([500, 1000, 5000, 10000, 20000], () => 1) : null,
        discount: discounted
          ? rng.chance(0.5)
            ? { type: "percent", value: rng.pickWeighted([5, 10], () => 1) }
            : { type: "amount", value: 500 }
          : null,
        role: discounted || rng.chance(0.5) ? "owner" : "cashier",
      });
    }
    daySales.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const s of daySales) {
      if (s.at.getTime() >= now.getTime()) continue; // gelecekteki saatler atlanır
      s.key = key++;
      sales.push(s);
    }
  }
  return sales;
}

/** Düşük stoklu ürünleri (Çay, Şampuan) içermeyen, uygun satışlara iptal ve iade işaretler. */
function markVoidsAndReturns(sales: PlannedSale[], days: string[]): { voids: number; returns: number } {
  const lowFinal = new Set(SEED_PRODUCTS.flatMap((p, i) => (p.stock < p.minStock * 2 ? [i] : [])));
  const safe = (s: PlannedSale) => s.items.every((i) => !lowFinal.has(i.p));
  const pick = (day: string, pred: (s: PlannedSale) => boolean) =>
    sales.find((s) => s.day === day && safe(s) && !s.voidAt && !s.returnAt && pred(s));

  let voids = 0;
  for (const offset of [9, 4]) {
    const day = days[days.length - 1 - offset]!;
    const s = pick(day, (x) => getIstanbulHour(x.at) <= 20);
    if (s) {
      s.voidAt = new Date(s.at.getTime() + 7 * 60_000);
      voids++;
    }
  }
  let returns = 0;
  for (const [offset, after] of [[8, 2], [5, 1]] as const) {
    const day = days[days.length - 1 - offset]!;
    const s = pick(day, (x) => x.items.length >= 1);
    if (s) {
      s.items[0]!.qty = Math.max(s.items[0]!.qty, 2); // kısmi iade için en az 2 adet
      s.returnAt = istanbulLocalToUtc(addDays(day, after), 11, 15);
      returns++;
    }
  }
  return { voids, returns };
}

/**
 * Zamanda geriye yürüyerek her ürünün başlangıç stoğunu ve sabah mal girişlerini hesaplar;
 * sonuçta bugünkü stok tablodaki değere eşit olur.
 */
function planStock(rng: Rng, sales: PlannedSale[], days: string[]) {
  const events: StockEvent[] = [];
  for (const s of sales) {
    for (const i of s.items) {
      events.push({ at: s.at.getTime(), p: i.p, change: -i.qty });
      if (s.voidAt) events.push({ at: s.voidAt.getTime(), p: i.p, change: i.qty });
    }
    if (s.returnAt) events.push({ at: s.returnAt.getTime(), p: s.items[0]!.p, change: 1 });
  }

  const purchases = new Map<string, Map<number, number>>(); // gün → ürün → adet
  const initialStock: number[] = [];
  SEED_PRODUCTS.forEach((sp, p) => {
    const full = Math.max(sp.stock, sp.minStock * 2, 10);
    const mine = events.filter((e) => e.p === p);
    let s = sp.stock;
    for (let d = days.length - 1; d >= 0; d--) {
      const dayStart = istanbulLocalToUtc(days[d]!, 8, 30).getTime();
      const dayEnd = istanbulLocalToUtc(addDays(days[d]!, 1), 0, 0).getTime();
      const dayEvents = mine.filter((e) => e.at >= dayStart && e.at < dayEnd).sort((a, b) => b.at - a.at);
      for (const e of dayEvents) s -= e.change;
      if (s > full) {
        const low = Math.min(s - 1, rng.int(sp.minStock, Math.max(sp.minStock, Math.floor(sp.minStock * 1.5))));
        const q = s - low;
        const m = purchases.get(days[d]!) ?? new Map<number, number>();
        m.set(p, q);
        purchases.set(days[d]!, m);
        s = low;
      }
    }
    initialStock[p] = s;
  });

  // Kontrol: ileriye doğru simülasyonda stok hiçbir an eksiye düşmemeli.
  const stock = [...initialStock];
  const timeline = [
    ...events.map((e) => ({ ...e, kind: 0 })),
    ...[...purchases].flatMap(([day, m]) =>
      [...m].map(([p, q]) => ({ at: istanbulLocalToUtc(day, 8, 30).getTime(), p, change: q, kind: -1 })),
    ),
  ].sort((a, b) => a.at - b.at || a.kind - b.kind);
  for (const e of timeline) {
    stock[e.p]! += e.change;
    if (stock[e.p]! < 0) throw new Error(`Seed planı hatalı: ${SEED_PRODUCTS[e.p]!.name} stoğu eksiye düşüyor`);
  }
  SEED_PRODUCTS.forEach((sp, p) => {
    if (stock[p] !== sp.stock) throw new Error(`Seed planı hatalı: ${sp.name} son stok ${stock[p]} ≠ ${sp.stock}`);
  });

  return { initialStock, purchases };
}

export interface SeedBarcodeRow {
  no: number;
  productId: number;
  name: string;
  category: string;
  barcode: string;
  type: "internal" | "manufacturer";
  isPrimary: boolean;
}

export interface SeedResult {
  products: number;
  sales: number;
  voids: number;
  returns: number;
  purchases: number;
  firstDay: string;
  lastDay: string;
  barcodes: SeedBarcodeRow[];
}

/** Boş (yeni migration uygulanmış) bir veritabanını örnek verilerle doldurur. */
export function runSeed(db: DB, opts: { now?: Date; randomSeed?: number } = {}): SeedResult {
  const realNow = opts.now ?? new Date();
  let clock = realNow;
  const ctx: Ctx = { db, now: () => clock };
  const setClock = (d: Date) => (clock = d);

  if ((db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }).c > 0) {
    throw new Error("Seed sadece boş veritabanına uygulanabilir.");
  }

  const rng = createRng(opts.randomSeed ?? 20261006);
  const today = getBusinessDate(realNow);
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(today, i - (HISTORY_DAYS - 1)));

  const sales = planSales(rng, days, realNow);
  const marked = markVoidsAndReturns(sales, days);
  const { initialStock, purchases } = planStock(rng, sales, days);

  saveSettings(db, { businessName: "Örnek Market" });

  // 1. Ürünler (14 gün önce, açılıştan önce)
  setClock(istanbulLocalToUtc(addDays(days[0]!, -1), 18, 0));
  const productIds: number[] = [];
  const manufacturerBarcode = new Map<number, string>();
  SEED_PRODUCTS.forEach((sp: SeedProduct, p) => {
    const created = createProduct(ctx, {
      name: sp.name,
      categoryName: sp.category,
      salePriceKurus: kurus(sp.price),
      costPriceKurus: kurus(sp.cost),
      vatRate: sp.vat,
      initialStock: initialStock[p]!,
      minStock: sp.minStock,
    });
    productIds[p] = created.id;
    const body = MANUFACTURER_BARCODE_BODIES[sp.no];
    if (body) {
      const code = body + String(calcEan13CheckDigit(body));
      addBarcodeToProduct(ctx, created.id, code, { type: "manufacturer" });
      manufacturerBarcode.set(p, code);
    }
  });
  const primaryBarcode = (p: number) =>
    listBarcodesByProduct(db, productIds[p]!).find((b) => b.isPrimary)!.barcode;

  // 2. Zaman sıralı olaylar
  type Ev =
    | { at: number; order: number; kind: "purchase"; day: string; items: Map<number, number> }
    | { at: number; order: number; kind: "sale"; sale: PlannedSale }
    | { at: number; order: number; kind: "void"; sale: PlannedSale }
    | { at: number; order: number; kind: "return"; sale: PlannedSale };
  const evs: Ev[] = [];
  for (const [day, items] of purchases) {
    evs.push({ at: istanbulLocalToUtc(day, 8, 30).getTime(), order: 0, kind: "purchase", day, items });
  }
  for (const s of sales) {
    evs.push({ at: s.at.getTime(), order: 1, kind: "sale", sale: s });
    if (s.voidAt) evs.push({ at: s.voidAt.getTime(), order: 2, kind: "void", sale: s });
    if (s.returnAt) evs.push({ at: s.returnAt.getTime(), order: 2, kind: "return", sale: s });
  }
  evs.sort((a, b) => a.at - b.at || a.order - b.order);

  const saleIds = new Map<number, { id: number; itemIds: number[] }>();
  let invoiceNo = 1000;
  for (const ev of evs) {
    setClock(new Date(ev.at));
    if (ev.kind === "purchase") {
      createPurchase(ctx, {
        supplier: SUPPLIERS[rng.int(0, SUPPLIERS.length - 1)]!,
        invoiceNo: `F-${++invoiceNo}`,
        items: [...ev.items].map(([p, qty]) => ({
          productId: productIds[p]!,
          qty,
          unitCostKurus: kurus(SEED_PRODUCTS[p]!.cost),
        })),
      });
    } else if (ev.kind === "sale") {
      const s = ev.sale;
      const subtotal = s.items.reduce((a, i) => a + kurus(SEED_PRODUCTS[i.p]!.price) * i.qty, 0);
      const discount = s.discount && s.discount.type === "amount" && s.discount.value * 3 > subtotal ? null : s.discount;
      const total = subtotal - resolveCartDiscount(subtotal, discount);
      // Müşterinin verdiği para: toplamı seçilen banknot birimine yukarı yuvarla (tam sayı aritmetiği)
      const cashReceivedKurus =
        s.payment === "cash" && s.tenderStep ? total + ((s.tenderStep - (total % s.tenderStep)) % s.tenderStep) : null;
      const r = completeSale(
        ctx,
        {
          clientRequestId: randomUUID(),
          items: s.items.map((i) => ({
            productId: productIds[i.p]!,
            qty: i.qty,
            barcode: i.useManufacturerBarcode ? manufacturerBarcode.get(i.p)! : primaryBarcode(i.p),
          })),
          cartDiscount: discount,
          paymentMethod: s.payment,
          cashReceivedKurus,
        },
        // Örnek veride iki vardiyalı kasiyer: öğleden önce Zeynep, sonra Ali (kasiyer performansı raporu için)
        { role: s.role, name: getIstanbulHour(s.at) < 15 ? "Zeynep Demir" : "Ali Çelik" },
      );
      saleIds.set(s.key, { id: r.sale.id, itemIds: r.items.map((i) => i.id) });
    } else if (ev.kind === "void") {
      voidSale(ctx, saleIds.get(ev.sale.key)!.id, { reason: "Yanlış ürün okutuldu, müşteri vazgeçti" });
    } else {
      const ids = saleIds.get(ev.sale.key)!;
      createReturn(ctx, {
        saleId: ids.id,
        items: [{ saleItemId: ids.itemIds[0]!, qty: 1 }],
        reason: "Ürün kusurlu çıktı",
      });
    }
  }

  // 3. Son kontrol: bugünkü stoklar tablodakiyle aynı olmalı
  SEED_PRODUCTS.forEach((sp, p) => {
    const actual = getProductById(db, productIds[p]!)!.stockQty;
    if (actual !== sp.stock) throw new Error(`${sp.name}: stok ${actual}, beklenen ${sp.stock}`);
  });

  const barcodes: SeedBarcodeRow[] = SEED_PRODUCTS.flatMap((sp, p) =>
    listBarcodesByProduct(db, productIds[p]!).map((b) => ({
      no: sp.no,
      productId: productIds[p]!,
      name: sp.name,
      category: sp.category,
      barcode: b.barcode,
      type: b.type,
      isPrimary: b.isPrimary,
    })),
  );

  return {
    products: SEED_PRODUCTS.length,
    sales: sales.length,
    voids: marked.voids,
    returns: marked.returns,
    purchases: purchases.size,
    firstDay: days[0]!,
    lastDay: days[days.length - 1]!,
    barcodes,
  };
}

/** Barkod listesini Excel'in Türkçe ayarlarıyla açılabilen CSV'ye çevirir (UTF-8 BOM, ; ayraç). */
export function barcodesToCsv(rows: SeedBarcodeRow[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const lines = [
    ["No", "Ürün", "Kategori", "Barkod", "Tür", "Birincil"].join(";"),
    ...rows.map((r) =>
      [
        String(r.no),
        esc(r.name),
        esc(r.category),
        r.barcode,
        r.type === "internal" ? "Dükkân içi" : "Üretici",
        r.isPrimary ? "Evet" : "Hayır",
      ].join(";"),
    ),
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
