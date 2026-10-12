/**
 * Yerleşik asistan: aylık raporun bütün yorumunu bu bilgisayarda, internetsiz ve hesapsız yazar.
 * Hesaplanmış rakamlardan (facts) her alana not verir, bulguları ve fırsatı cümleler, personeli ekibin geri kalanıyla kıyaslar,
 * kural tabanlı önerileri haftalara dağıtır, geçen ayın yapılmayan aksiyonlarını hatırlatır, mevsim önerilerini ekler,
 * riskleri ve gelecek ayın odağını belirler. Çıktı, merkezi yapay zekânın yorumuyla aynı biçimdedir (AiReport).
 */
import { ACTION_AREA_LABELS, METRIC_INFO, PACE_LABELS, monthLabel, shiftMonth, type ActionArea } from "@/lib/assistant";
import type { AiReport } from "@/lib/assistantAi";
import { divRound, formatPermille, formatTRY, mulDivRound } from "@/lib/money";
import { seasonalItems } from "@/lib/seasonal";
import { withSuffix } from "@/lib/turkish";
import { IMPACT_KIND_LABELS, type ActionPriority, type PlanAction } from "./actions";
import type { MonthlyFacts, StaffLine } from "./facts";
import type { TargetProposal } from "./targets";

type Grade = "iyi" | "orta" | "zayif";
type Area = AiReport["sections"][number]["area"];
type Week = AiReport["actions"][number]["week"];

const TL = formatTRY;
const pct = formatPermille;
/** "%55,6'sı" (iyelik) / "%80,0'ini" (iyelik + belirtme) — ek son rakamın okunuşuna göre */
const pctP = (p: number | null) => (p === null ? "—" : withSuffix(pct(p), "poss"));
const pctA = (p: number | null) => (p === null ? "—" : withSuffix(pct(p), "acc"));
/** "+%7,0" / "-%3,2" */
const signed = (p: number | null) => (p === null ? "—" : `${p >= 0 ? "+" : ""}${pct(p)}`);
/** binde → "1,6 puan" */
const points = (p: number) => `${pct(Math.abs(p)).slice(1)} puan`;
const tenths = (v: number | null) => (v === null ? "—" : `${Math.floor(v / 10)},${v % 10}`);
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
/** Hedef adları cümle içinde */
const METRIC_SHORT: Record<string, string> = {
  revenue: "ciro",
  gross_profit: "brüt kâr",
  net_profit: "net kâr",
  margin: "kâr marjı",
  avg_basket: "ortalama sepet",
  sale_count: "satış sayısı",
  expenses: "gider bütçesi",
};
const upDown = (p: number | null, up = "arttı", down = "azaldı", flat = "yatay kaldı") => (p === null ? "" : p > 10 ? up : p < -10 ? down : flat);

interface Section {
  area: Area;
  title: string;
  grade: Grade;
  comment: string;
  findings: string[];
  opportunity: string;
}

// ------------------------------------------------------------------ alanlar

function ciro(f: MonthlyFacts): Section {
  const k = f.kpi;
  const ch = f.changes.revenue;
  const findings = [
    `Ciro ${TL(k.revenueGrossKurus)}${ch !== null ? `, önceki aya göre ${signed(ch)}` : ""}; ${k.saleCount} satış, ${k.sellingDays} satış günü${k.avgDailyRevenueKurus !== null ? `, günlük ortalama ${TL(k.avgDailyRevenueKurus)}` : ""}.`,
  ];
  if (f.changes.saleCount !== null && f.changes.avgBasket !== null) {
    const fromCustomers = f.changes.saleCount >= f.changes.avgBasket;
    findings.push(
      `Müşteri (fiş) sayısı ${signed(f.changes.saleCount)}, ortalama sepet ${signed(f.changes.avgBasket)}: değişimi daha çok ${fromCustomers ? "müşteri sayısı" : "sepet büyüklüğü"} belirledi.`,
    );
  }
  if (f.lastYear) {
    const ly = f.lastYear.kpi.revenueGrossKurus;
    const lyCh = ly > 0 ? mulDivRound(k.revenueGrossKurus - ly, 1000, ly) : null;
    findings.push(`Geçen yılın aynı ayına (${monthLabel(f.lastYear.month)}) göre ${signed(lyCh)}.`);
  }
  const rev = f.targets.find((t) => t.metric === "revenue");
  if (rev) findings.push(`Ciro hedefi ${TL(rev.target)}: ${f.isPartial ? `gidişat “${PACE_LABELS[rev.status]}”, ay sonu tahmini ${TL(rev.forecast ?? rev.actual)}` : rev.actual >= rev.target ? "tuttu" : `tutmadı (${TL(rev.target - rev.actual)} eksik)`}.`);
  const grade: Grade = ch === null ? (rev && rev.status !== "behind" ? "iyi" : "orta") : ch >= 50 ? "iyi" : ch >= -30 ? "orta" : "zayif";
  const weakDay = [...f.time.weekdays].filter((d) => d.avgPerDayKurus !== null && d.saleCount > 0).sort((a, b) => a.avgPerDayKurus! - b.avgPerDayKurus!)[0];
  const opportunity =
    f.changes.saleCount !== null && f.changes.avgBasket !== null && f.changes.saleCount > f.changes.avgBasket
      ? "Müşteri geliyor; kasada tek bir yan ürün önerisiyle sepeti büyütmek en hızlı kazanç."
      : `Daha çok müşteri çekmek: ${weakDay ? `en zayıf gün ${weakDay.day}` : "zayıf günler"} için küçük bir kampanya.`;
  return {
    area: "ciro",
    title: "Ciro ve müşteri",
    grade,
    comment: ch === null ? `Ciro ${TL(k.revenueGrossKurus)} (karşılaştırılacak önceki ay yok).` : `Ciro ${TL(k.revenueGrossKurus)}, önceki aya göre ${signed(ch)}.`,
    findings,
    opportunity,
  };
}

function kar(f: MonthlyFacts): Section {
  const k = f.kpi;
  const findings = [
    `Brüt kâr ${TL(k.grossProfitKurus)}, marj ${pct(k.marginPermille)}${f.changes.margin !== null ? ` (önceki aya göre ${f.changes.margin >= 0 ? "+" : "−"}${points(f.changes.margin)})` : ""}.`,
    `Giderler (KDV hariç) ${TL(k.expensesNetKurus)}; giderler sonrası net kâr ${TL(k.netProfitKurus)}.`,
  ];
  let breakEven: number | null = null;
  if (k.expensesNetKurus > 0 && k.grossProfitKurus > 0) {
    // Giderleri karşılayan ciro ≈ gider × (KDV dahil ciro / brüt kâr)
    breakEven = mulDivRound(k.expensesNetKurus, k.revenueGrossKurus, k.grossProfitKurus);
    findings.push(
      k.netProfitKurus < 0
        ? `Giderleri karşılamak için bu marjla aylık yaklaşık ${TL(breakEven)} ciro gerekiyor; şu an ${TL(k.revenueGrossKurus)}.`
        : `Giderleri karşılayan ciro yaklaşık ${TL(breakEven)}; bunun üstündeki her satış kâra yazılıyor.`,
    );
  }
  if (k.expensesNetKurus === 0) findings.push("Bu ay gider girilmemiş; net kâr gerçekte daha düşük.");
  const marginDrop = f.changes.margin !== null && f.changes.margin < -5;
  const grade: Grade = k.netProfitKurus <= 0 && k.expensesNetKurus > 0 ? "zayif" : k.expensesNetKurus === 0 || marginDrop ? "orta" : "iyi";
  const onePoint = mulDivRound(k.revenueNetKurus, 10, 1000);
  return {
    area: "kar",
    title: "Kârlılık",
    grade,
    comment:
      k.expensesNetKurus > 0
        ? `Net kâr ${TL(k.netProfitKurus)}, marj ${pct(k.marginPermille)}.`
        : `Brüt kâr ${TL(k.grossProfitKurus)}, marj ${pct(k.marginPermille)} (gider girilmemiş).`,
    findings,
    opportunity: `Marjı 1 puan artırmak, bu ciroyla aylık yaklaşık ${TL(onePoint)} ek kâr demek.`,
  };
}

function urun(f: MonthlyFacts): Section {
  const k = f.kpi;
  const top = f.products.topProfit[0];
  const a = f.abc.find((x) => x.cls === "A");
  const findings: string[] = [];
  if (top) findings.push(`En çok kazandıran ürün ${top.name}: ${TL(top.grossProfitKurus)} brüt kâr (${top.qty} adet).`);
  if (a) findings.push(`Cironun ${pctA(a.sharePermille)} ${a.count} ürün getiriyor (A sınıfı); ${f.products.soldCount} ürün satıldı, ${f.products.activeCount} aktif ürün var.`);
  const topRev = f.products.topRevenue[0];
  const conc = topRev && k.revenueGrossKurus > 0 ? mulDivRound(topRev.revenueGrossKurus, 1000, k.revenueGrossKurus) : 0;
  if (conc > 250) findings.push(`Cironun ${pctP(conc)} tek üründen (${topRev!.name}): bu ürün biterse ciro belirgin düşer.`);
  const rise = f.products.risers[0];
  const fall = f.products.fallers[0];
  if (rise) findings.push(`En çok yükselen: ${rise.name} (${rise.prevQty} → ${rise.qty} adet).`);
  if (fall) findings.push(`En çok düşen: ${fall.name} (${fall.prevQty} → ${fall.qty} adet).`);
  const neg = f.products.negativeMargin.length;
  const grade: Grade = neg > 0 ? "zayif" : f.products.fallers.filter((p) => p.prevQty >= 10 && p.qty * 1000 < p.prevQty * 700).length >= 2 ? "orta" : "iyi";
  return {
    area: "urun",
    title: "Ürünler",
    grade,
    comment: neg > 0 ? `${neg} ürün zararına satılıyor.` : top ? `${top.name} en kârlı ürün.` : "Ürün satışı yok.",
    findings: findings.slice(0, 4),
    opportunity: a ? `A sınıfı ${a.count} ürün asla bitmemeli; asgari stoklarını sipariş önerisine göre güncelleyin.` : "Satış verisi biriktikçe ürün önerileri netleşecek.",
  };
}

function kategori(f: MonthlyFacts): Section {
  const cats = f.categories.filter((c) => c.revenueGrossKurus > 0 || c.prevRevenueGrossKurus > 0);
  const best = cats[0];
  const growing = cats.filter((c) => c.changePermille !== null && c.changePermille > 0);
  const falling = [...cats].filter((c) => c.changePermille !== null && c.changePermille < -100 && (c.sharePermille ?? 0) > 50).sort((a, b) => a.changePermille! - b.changePermille!);
  const lowMargin = [...cats].filter((c) => c.marginPermille !== null && c.revenueGrossKurus > 0).sort((a, b) => a.marginPermille! - b.marginPermille!)[0];
  const findings: string[] = [];
  if (best) findings.push(`En büyük kategori ${best.name}: cironun ${pctP(best.sharePermille)}, marj ${pct(best.marginPermille)}.`);
  if (growing.length) findings.push(`Büyüyen kategoriler: ${growing.slice(0, 3).map((c) => `${c.name} (${signed(c.changePermille)})`).join(", ")}.`);
  if (falling.length) findings.push(`Belirgin düşen: ${falling.slice(0, 2).map((c) => `${c.name} (${signed(c.changePermille)})`).join(", ")}.`);
  if (lowMargin && lowMargin !== best) findings.push(`En düşük marjlı kategori ${lowMargin.name} (${pct(lowMargin.marginPermille)}).`);
  const grade: Grade = falling.length >= 2 ? "zayif" : falling.length === 1 ? "orta" : "iyi";
  return {
    area: "kategori",
    title: "Kategoriler",
    grade,
    comment: best ? `${best.name} cironun ${pctA(best.sharePermille)} getiriyor.` : "Kategori verisi yok.",
    findings: findings.length ? findings : ["Bu ay kategori bazında satış yok."],
    opportunity: lowMargin ? `${lowMargin.name} kategorisinde fiyatları gözden geçirin ya da daha kârlı ürünlerle zenginleştirin.` : "Ürünleri kategorilere ayırmak analizi güçlendirir.",
  };
}

function fiyat(f: MonthlyFacts): Section {
  const p = f.products;
  const all = [...p.negativeMargin, ...p.erosion, ...p.lowMarginStars];
  const gain = all.reduce((s, l) => s + l.monthlyGainKurus, 0);
  const findings: string[] = [];
  if (p.negativeMargin.length) findings.push(`${p.negativeMargin.length} ürün alış fiyatının altında satılıyor (ör. ${p.negativeMargin[0]!.name}: alış ${TL(p.negativeMargin[0]!.avgCostKurus)}, satış ${TL(p.negativeMargin[0]!.priceKurus)}).`);
  if (p.erosion.length) {
    const e = p.erosion[0]!;
    findings.push(`${p.erosion.length} üründe alış fiyatı arttı ama satış fiyatı aynı kaldı; ör. ${e.name} birim marjı ${pct(e.prevMarginPermille)} → ${pct(e.currentMarginPermille)}.`);
  }
  if (p.lowMarginStars.length) findings.push(`Çok satan ama marjı %15'in altında ${p.lowMarginStars.length} ürün var.`);
  findings.push(f.priceChanges > 0 ? `Bu ay ${f.priceChanges} fiyat değişikliği yapıldı.` : "Bu ay hiç fiyat değişikliği yapılmadı.");
  const n = p.negativeMargin.length + p.erosion.length;
  const grade: Grade = p.negativeMargin.length > 0 || n > 3 ? "zayif" : n > 0 ? "orta" : "iyi";
  return {
    area: "fiyat",
    title: "Fiyat ve maliyet",
    grade,
    comment: all.length ? `${all.length} üründe fiyat ayarı aylık ${TL(gain)} ek kâr getirebilir.` : "Fiyatlar maliyetlerle uyumlu.",
    findings,
    opportunity: all.length
      ? `Aşağıdaki tablodaki önerilen fiyatlar uygulanırsa aynı satışla aylık yaklaşık ${TL(gain)} ek brüt kâr.`
      : "Her mal girişinde alış fiyatı artan ürünün satış fiyatını aynı gün kontrol edin.",
  };
}

function stok(f: MonthlyFacts): Section {
  const s = f.stock;
  const findings = [
    `Stok değeri (alış fiyatıyla) ${TL(s.valueAtCostKurus)}${s.daysOfInventory !== null ? `; bugünkü satış hızıyla yaklaşık ${s.daysOfInventory} gün yeter` : ""}.`,
  ];
  if (s.outOfStock.length) findings.push(`Satılan ${s.outOfStock.length} ürün stokta yok (${s.outOfStock.slice(0, 3).map((o) => o.name).join(", ")}); haftada yaklaşık ${TL(s.outOfStock.reduce((a, o) => a + o.lostProfitPerWeekKurus, 0))} kâr kaçıyor.`);
  if (s.urgent.length) findings.push(`${s.urgent.length} ürün bir hafta içinde bitecek.`);
  if (s.dead.count) findings.push(`${s.dead.count} ürün 30 gündür satılmadı; rafta ${TL(s.dead.valueAtCostKurus)} bekliyor.`);
  findings.push(`Bu ay ${s.purchases.count} mal girişi (${TL(s.purchases.totalKurus)}).`);
  const deadShare = s.valueAtCostKurus > 0 ? mulDivRound(s.dead.valueAtCostKurus, 1000, s.valueAtCostKurus) : 0;
  const grade: Grade = s.outOfStock.length >= 3 ? "zayif" : s.outOfStock.length > 0 || deadShare > 200 || (s.daysOfInventory ?? 0) > 90 ? "orta" : "iyi";
  return {
    area: "stok",
    title: "Stok",
    grade,
    comment: s.outOfStock.length ? `${s.outOfStock.length} çok satan ürün stokta yok.` : `Stok ${s.daysOfInventory ?? "—"} günlük satışa yetiyor.`,
    findings: findings.slice(0, 4),
    opportunity:
      (s.daysOfInventory ?? 0) > 60
        ? `Stok gereğinden fazla (${s.daysOfInventory} gün): satılmayanları eritip siparişleri 2 haftalık ihtiyaçla sınırlamak nakit açar.`
        : `Sipariş önerisini (${TL(s.reorderCostKurus)}) haftalık düzenli verin; bitmesi en pahalı kayıptır.`,
  };
}

function gider(f: MonthlyFacts): Section {
  const e = f.expenses;
  const k = f.kpi;
  if (e.totalNetKurus === 0) {
    return {
      area: "gider",
      title: "Giderler",
      grade: "orta",
      comment: "Bu ay gider girilmemiş.",
      findings: ["Kira, personel, faturalar girilmeden gerçek net kâr görülemez."],
      opportunity: "Muhasebe → Giderler ekranından ayın giderlerini girin.",
    };
  }
  const top = e.byCategory[0];
  const over = e.byCategory.filter((c) => c.avg3NetKurus !== null && c.avg3NetKurus > 0 && c.netKurus * 1000 > c.avg3NetKurus * 1200 && c.netKurus - c.avg3NetKurus >= 50_000);
  const findings = [
    `Giderler ${TL(e.totalNetKurus)} (KDV hariç); KDV hariç cironun ${pctP(e.ratioPermille)}.`,
    `Önceki ay ${TL(e.previousNetKurus)}${e.avg3NetKurus !== null ? `, son 3 ay ortalaması ${TL(e.avg3NetKurus)}` : ""}.`,
  ];
  if (top) findings.push(`En büyük kalem ${top.label}: ${TL(top.netKurus)}.`);
  if (over.length) findings.push(`Ortalamanın belirgin üstünde: ${over.map((c) => `${c.label} (${TL(c.netKurus)}, ortalama ${TL(c.avg3NetKurus!)})`).join(", ")}.`);
  const grade: Grade = e.totalNetKurus > k.grossProfitKurus ? "zayif" : e.totalNetKurus * 1000 > k.grossProfitKurus * 700 || over.length ? "orta" : "iyi";
  return {
    area: "gider",
    title: "Giderler",
    grade,
    comment: e.totalNetKurus > k.grossProfitKurus ? `Giderler (${TL(e.totalNetKurus)}) brüt kârı aşıyor.` : `Giderler brüt kârın ${pctP(k.grossProfitKurus > 0 ? mulDivRound(e.totalNetKurus, 1000, k.grossProfitKurus) : null)}.`,
    findings,
    opportunity: over.length ? `${over[0]!.label} giderini ortalamaya indirmek aylık yaklaşık ${TL(over[0]!.netKurus - over[0]!.avg3NetKurus!)} kazandırır.` : "Giderleri her ay girip ortalamayla karşılaştırın; sıçramayı erken yakalarsınız.",
  };
}

function zaman(f: MonthlyFacts): Section {
  const days = f.time.weekdays.filter((d) => d.avgPerDayKurus !== null && d.saleCount > 0);
  const findings: string[] = [];
  let comment = "Gün/saat verisi yok.";
  let grade: Grade = "iyi";
  let opp = "Yoğun saatten önce rafları doldurun; sessiz saatleri sipariş ve düzen işlerine ayırın.";
  if (days.length >= 2) {
    const sorted = [...days].sort((a, b) => b.avgPerDayKurus! - a.avgPerDayKurus!);
    const best = sorted[0]!;
    const weak = sorted[sorted.length - 1]!;
    const avg = divRound(days.reduce((a, d) => a + d.avgPerDayKurus!, 0), days.length);
    findings.push(`En güçlü gün ${best.day} (günlük ${TL(best.avgPerDayKurus!)}), en zayıf ${weak.day} (${TL(weak.avgPerDayKurus!)}); ortalama ${TL(avg)}.`);
    comment = `${best.day} en güçlü, ${weak.day} en zayıf gün.`;
    if (avg > 0 && weak.avgPerDayKurus! * 1000 < avg * 700) {
      grade = "orta";
      opp = `${weak.day} günleri ortalamanın belirgin altında: o güne özel tek bir fırsat ürünü deneyin.`;
    }
  }
  if (f.time.peakHours.length) findings.push(`Yoğun saatler: ${[...f.time.peakHours].sort((a, b) => a - b).map(hour).join(", ")}.`);
  if (f.time.quietHours.length) findings.push(`Sessiz saatler (satışın %2,5'inden azı): ${f.time.quietHours.map(hour).join(", ")}.`);
  return {
    area: "zaman",
    title: "Gün ve saatler",
    grade,
    comment,
    findings: findings.length ? findings : ["Bu ay satış yok."],
    opportunity: opp,
  };
}

function sepet(f: MonthlyFacts): Section {
  const k = f.kpi;
  const pair = f.basket.pairs.find((p) => p.liftHundredths >= 150) ?? f.basket.pairs[0];
  const findings = [
    `Ortalama sepet ${k.avgBasketKurus === null ? "—" : TL(k.avgBasketKurus)}${f.changes.avgBasket !== null ? ` (${signed(f.changes.avgBasket)})` : ""}; fiş başına ${tenths(k.itemsPerBasketTenths)} ürün.`,
    `İndirimler satışların ${pctP(k.discountRatePermille)} (${TL(k.discountKurus)}).`,
  ];
  if (pair) findings.push(`En güçlü ikili: ${pair.a} + ${pair.b} (${pair.together} fişte birlikte, beklenenin ${Math.floor(pair.liftHundredths / 100)},${String(pair.liftHundredths % 100).padStart(2, "0")} katı).`);
  const ch = f.changes.avgBasket;
  const grade: Grade = ch === null ? "orta" : ch >= 0 ? "iyi" : ch >= -30 ? "orta" : "zayif";
  return {
    area: "sepet",
    title: "Sepet",
    grade,
    comment: `Fiş başına ${tenths(k.itemsPerBasketTenths)} ürün, ortalama ${k.avgBasketKurus === null ? "—" : TL(k.avgBasketKurus)}.`,
    findings,
    opportunity: pair ? `${pair.a} ile ${pair.b}'yi yan yana koyun ya da ikili fiyat yapın.` : "Kasanın önüne küçük, kârlı ürünler koyun; kasada tek bir öneri yapın.",
  };
}

function iade(f: MonthlyFacts): Section {
  const k = f.kpi;
  const voidRate = k.saleCount + k.voidedCount > 0 ? mulDivRound(k.voidedCount, 1000, k.saleCount + k.voidedCount) : 0;
  const findings = [`${k.returnCount} iade (${TL(k.refundsKurus)}, satışların ${pctP(f.returns.ratePermille)}); ${k.voidedCount} satış iptali (${pct(voidRate)}).`];
  const top = f.returns.topProducts[0];
  if (top) findings.push(`En çok iade edilen ${top.name}: ${top.soldQty} satıştan ${top.returnedQty} iade.`);
  const rate = f.returns.ratePermille ?? 0;
  const grade: Grade = rate <= 10 && voidRate <= 20 ? "iyi" : rate <= 30 && voidRate <= 40 ? "orta" : "zayif";
  return {
    area: "iade",
    title: "İade ve iptal",
    grade,
    comment: `İade oranı ${pct(f.returns.ratePermille)}, iptal oranı ${pct(voidRate)}.`,
    findings,
    opportunity: grade === "iyi" ? "İade ve iptal düşük; mevcut düzeni koruyun." : "Sık iade edilen ürünlerin kalitesini/son kullanma tarihini, sık iptal yapan kasiyerin okutma alışkanlığını kontrol edin.",
  };
}

function kasa(f: MonthlyFacts): Section {
  const c = f.cash;
  const findings = [`${c.closedDays} gün kapatıldı, ${c.countedDays} gün kasa sayıldı; kapatılmayan satış günü: ${c.daysWithSalesNotClosed}.`];
  if (c.shortageDays) findings.push(`Kasa ${c.shortageDays} gün eksik çıktı: toplam ${TL(c.shortageKurus)}.`);
  if (c.excessDays) findings.push(`Kasa ${c.excessDays} gün fazla çıktı: toplam ${TL(c.excessKurus)} (para üstü hatası işareti olabilir).`);
  if (c.okcDiffPermille !== null) findings.push(`Yazar kasa Z toplamı programdan ${signed(c.okcDiffPermille)} farklı.`);
  const okcBad = c.okcDiffPermille !== null && Math.abs(c.okcDiffPermille) > 50;
  const grade: Grade = okcBad || c.shortageKurus > 100_000 ? "zayif" : c.shortageKurus > 0 || c.daysWithSalesNotClosed > 3 ? "orta" : "iyi";
  return {
    area: "kasa",
    title: "Kasa kontrolü",
    grade,
    comment: c.shortageKurus > 0 ? `${c.shortageDays} günde ${TL(c.shortageKurus)} kasa açığı.` : c.countedDays ? "Kasa sayımlarında açık yok." : "Kasa sayımı yapılmamış.",
    findings,
    opportunity: c.countedDays < c.closedDays || c.daysWithSalesNotClosed > 0 ? "Her akşam Günü Kapat'ta sayılan nakdi girin; açık ancak ölçülürse kapanır." : "Vardiya değişiminde kasayı birlikte sayın.",
  };
}

// ------------------------------------------------------------------ personel

interface StaffEval {
  alias: string;
  assessment: string;
  strengths: string[];
  improve: string[];
  flagged: boolean;
}

function staffEval(f: MonthlyFacts): { summary: string; people: StaffEval[]; grade: Grade } {
  const t = f.staff.team;
  const members = f.staff.members.filter((m) => m.saleCount + m.voidCount > 0);
  if (members.length === 0) return { summary: "Bu ay satış yapan kullanıcı yok.", people: [], grade: "orta" };
  const best = (fn: (m: StaffLine) => number | null) => {
    const vals = members.map((m) => ({ m, v: fn(m) })).filter((x) => x.v !== null) as { m: StaffLine; v: number }[];
    return vals.length >= 2 ? vals.sort((a, b) => b.v - a.v) : [];
  };
  const byHour = best((m) => m.salesPerHourKurus);
  const people = members.map((m): StaffEval => {
    const othersSales = t.saleCount - m.saleCount;
    const othersTotal = t.salesTotalKurus - m.salesTotalKurus;
    const othersBasket = othersSales > 0 ? divRound(othersTotal, othersSales) : null;
    const othersVoid = othersSales + t.voidCount - m.voidCount > 0 ? mulDivRound(t.voidCount - m.voidCount, 1000, othersSales + t.voidCount - m.voidCount) : 0;
    const othersDisc = othersTotal + t.discountKurus - m.discountKurus > 0 ? mulDivRound(t.discountKurus - m.discountKurus, 1000, othersTotal + t.discountKurus - m.discountKurus) : 0;
    const strengths: string[] = [];
    const improve: string[] = [];
    if (members.length > 1 && members.every((x) => x.saleCount <= m.saleCount)) strengths.push(`En çok satışı yapan (${m.saleCount} fiş, cironun ${pctP(m.sharePermille)})`);
    if (othersBasket !== null && m.avgBasketKurus !== null && m.saleCount >= 20) {
      if (m.avgBasketKurus * 1000 >= othersBasket * 1100) strengths.push(`Büyük sepet: ${TL(m.avgBasketKurus)} (ekibin geri kalanı ${TL(othersBasket)})`);
      else if (m.avgBasketKurus * 1000 < othersBasket * 850) improve.push(`Sepet ekibin geri kalanından düşük (${TL(m.avgBasketKurus)} / ${TL(othersBasket)}): kasada tek yan ürün önerisi`);
    }
    if (byHour.length && byHour[0]!.m === m) strengths.push(`En yüksek saatlik satış (${TL(m.salesPerHourKurus!)})`);
    else if (byHour.length >= 2 && byHour[byHour.length - 1]!.m === m && m.salesPerHourKurus !== null) improve.push(`Saatlik satış ekibin en düşüğü (${TL(m.salesPerHourKurus)}); vardiyası sessiz saatlere denk geliyor olabilir`);
    if (m.voidCount === 0 && m.saleCount >= 30) strengths.push("Hiç satış iptali yok");
    const voidBad = m.voidRatePermille !== null && m.voidCount >= 3 && m.voidRatePermille > Math.max(30, 2 * othersVoid);
    if (voidBad) improve.push(`İptal oranı ${pct(m.voidRatePermille)} (ekibin geri kalanı ${pct(othersVoid)}): okutma ve iptal adımlarını birlikte tekrar edin`);
    const discBad = m.discountRatePermille !== null && m.discountKurus >= 20_000 && m.discountRatePermille > Math.max(30, 2 * othersDisc);
    if (discBad) improve.push(`İndirim oranı ${pct(m.discountRatePermille)}: indirim kuralını netleştirin`);
    if (m.refundRatePermille !== null && m.refundRatePermille > 50 && m.returnCount >= 3) improve.push(`Satışlarından iade oranı ${pct(m.refundRatePermille)}`);
    const assessment = `${m.alias} ${m.activeDays} gün ${m.role === "owner" ? "satış yaptı" : "kasada çalıştı"}: ${m.saleCount} satış, ${TL(m.salesTotalKurus)} ciro (${pct(m.sharePermille)}), ortalama sepet ${m.avgBasketKurus === null ? "—" : TL(m.avgBasketKurus)}, fiş başına ${tenths(m.itemsPerSaleTenths)} ürün.${
      improve.length === 0 ? " Belirgin bir sorun görünmüyor." : ""
    }`;
    return { alias: m.alias, assessment, strengths: strengths.slice(0, 3), improve: improve.slice(0, 3), flagged: voidBad || discBad };
  });
  const flagged = people.filter((p) => p.flagged);
  const leader = [...members].sort((a, b) => b.salesTotalKurus - a.salesTotalKurus)[0]!;
  const summary =
    members.length === 1
      ? `Bu ay satışların tamamını ${leader.alias} yaptı. Tek kişiye bağımlılık, izin ve hastalık günlerinde risk demektir.`
      : `${members.length} kişi satış yaptı; cironun en büyük payı ${pct(leader.sharePermille)} ile ${leader.alias}. Ekip ortalaması: sepet ${t.avgBasketKurus === null ? "—" : TL(t.avgBasketKurus)}, iptal ${pct(t.voidRatePermille)}, indirim ${pct(t.discountRatePermille)}.${
          flagged.length ? ` Dikkat: ${flagged.map((p) => p.alias).join(", ")} için iptal/indirim alışkanlığı konuşulmalı.` : " Kişiler arasında dikkat çeken bir sorun yok."
        }`;
  const grade: Grade = flagged.some((p) => p.improve.some((i) => i.startsWith("İptal"))) && flagged.length > 0 ? "zayif" : flagged.length ? "orta" : "iyi";
  return { summary, people, grade };
}

// ------------------------------------------------------------------ plan

const WEEK_BY_AREA: Record<ActionArea, Week> = {
  fiyat: "1. hafta",
  stok: "1. hafta",
  kasa: "2. hafta",
  personel: "2. hafta",
  gider: "3. hafta",
  urun: "3. hafta",
  satis: "Ay boyunca",
  musteri: "Ay boyunca",
};

function impactText(a: PlanAction): string {
  if (a.impactMinKurus === null || a.impactMaxKurus === null || !a.impactKind) return "Etkisi gelecek ayın raporunda ölçülerek görülecek.";
  return `${TL(a.impactMinKurus)} – ${TL(a.impactMaxKurus)} ${IMPACT_KIND_LABELS[a.impactKind]}`;
}

function buildActions(f: MonthlyFacts, rules: PlanAction[], planMonth: string): AiReport["actions"] {
  const prior = new Map((f.priorActions?.items ?? []).map((i) => [i.key, i.status]));
  const out: AiReport["actions"] = rules.slice(0, 7).map((a) => {
    const was = prior.get(a.key);
    const note = was === "open" ? " Geçen ay da önerilmişti ve henüz yapılmadı." : was === "done" ? " Geçen ay “yapıldı” işaretlendi ama sorun sürüyor; uygulamayı kontrol edin." : "";
    const week: Week = a.priority === "yuksek" ? "1. hafta" : WEEK_BY_AREA[a.area];
    return {
      title: a.title,
      why: a.why + note,
      steps: a.steps.slice(0, 6),
      expectedImpact: impactText(a),
      measure: a.measure,
      priority: (was === "open" && a.priority !== "yuksek" ? "yuksek" : a.priority) as ActionPriority,
      area: a.area,
      week,
      ruleKey: a.key,
    };
  });
  // Geçen ayın yapılmayan ve bu ay kurallarda çıkmayan önemli aksiyonları
  const ruleKeys = new Set(rules.map((r) => r.key));
  const leftovers = (f.priorActions?.items ?? []).filter((i) => i.status === "open" && !ruleKeys.has(i.key) && !i.key.startsWith("ai-"));
  if (leftovers.length) {
    out.push({
      title: `${monthLabel(f.priorActions!.month)} planından kalanlar: ${leftovers.length} aksiyon`,
      why: "Bu aksiyonlar işaretlenmedi. Yapıldıysa ekranda “Yapıldı” deyin; yapılmadıysa hâlâ geçerli mi bakın.",
      steps: leftovers.slice(0, 4).map((l) => l.title),
      expectedImpact: "Etkisi gelecek ayın raporunda ölçülerek görülecek.",
      measure: "Geçen ayın aksiyonları ne oldu? bölümünde hepsi işaretli olmalı.",
      priority: "orta",
      area: "satis",
      week: "1. hafta",
      ruleKey: null,
    });
  }
  // Mevsim / özel gün hazırlığı (planın uygulanacağı ay için)
  for (const s of seasonalItems(planMonth).slice(0, 2)) {
    out.push({
      title: `Mevsim hazırlığı — ${s.title}`,
      why: `${monthLabel(planMonth)} ayında talebi değiştiren dönem. Hazırlık bir hafta önceden yapılırsa stok bitmez, fırsat kaçmaz.`,
      steps: s.steps,
      expectedImpact: "Etkisi gelecek ayın raporunda ölçülerek görülecek.",
      measure: "İlgili ürünlerin satış adedi ve stokta kalma durumu.",
      priority: "orta",
      area: "satis",
      week: "1. hafta",
      ruleKey: null,
    });
  }
  const rank: Record<ActionPriority, number> = { yuksek: 0, orta: 1, dusuk: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 9);
}

function risks(f: MonthlyFacts): string[] {
  const k = f.kpi;
  const out: string[] = [];
  if (k.expensesNetKurus > 0 && k.netProfitKurus < 0) out.push(`Giderler brüt kârı aşıyor: ay ${TL(-k.netProfitKurus)} zararla kapandı. Ciro artmaz ya da giderler düşmezse zarar sürer.`);
  const t = f.trend;
  if (t.length >= 3) {
    const [a, b, c] = t.slice(-3);
    if (a!.revenueGrossKurus > b!.revenueGrossKurus && b!.revenueGrossKurus > c!.revenueGrossKurus && !f.isPartial) out.push("Ciro üç aydır üst üste düşüyor.");
  }
  if (f.changes.margin !== null && f.changes.margin <= -10) out.push(`Marj ${points(f.changes.margin)} düştü; maliyet artışları fiyata yansımıyor olabilir.`);
  if (f.stock.outOfStock.length) out.push(`Stokta olmayan çok satanlar müşteriyi başka dükkâna alıştırabilir (${f.stock.outOfStock.slice(0, 2).map((o) => o.name).join(", ")}).`);
  if (f.cash.okcDiffPermille !== null && Math.abs(f.cash.okcDiffPermille) > 50) out.push("Yazar kasa Z toplamı programla tutmuyor: fişi kesilmeyen satış yasal risk taşır.");
  if (f.cash.shortageKurus >= 50_000) out.push(`Tekrarlayan kasa açığı (${TL(f.cash.shortageKurus)}).`);
  const top = f.products.topRevenue[0];
  if (top && k.revenueGrossKurus > 0 && top.revenueGrossKurus * 1000 > k.revenueGrossKurus * 250) out.push(`Ciro tek ürüne bağımlı (${top.name}).`);
  const members = f.staff.members.filter((m) => m.saleCount > 0);
  if (members.length === 1 && k.saleCount > 0) out.push("Bütün satışlar tek kişide; yedek kasiyer yok.");
  if (f.dataQuality.notes.some((n) => n.includes("alış fiyatı 0"))) out.push("Alış fiyatı girilmemiş ürünler kârı olduğundan yüksek gösteriyor.");
  return out.slice(0, 4);
}

// ------------------------------------------------------------------ ana fonksiyon

/** Yerleşik asistanın raporu (internetsiz). */
export function buildLocalReport(input: { facts: MonthlyFacts; ruleActions: PlanAction[]; nextTargets: TargetProposal[]; potential: { minKurus: number; maxKurus: number } }): AiReport {
  const f = input.facts;
  const k = f.kpi;
  const planMonth = f.isPartial ? f.month : shiftMonth(f.month, 1);
  const sections = [ciro(f), kar(f), urun(f), kategori(f), fiyat(f), stok(f), gider(f), zaman(f), sepet(f), iade(f), kasa(f)];
  const staff = staffEval(f);
  const actions = buildActions(f, input.ruleActions, planMonth);
  const top = input.ruleActions[0];

  if (k.saleCount === 0) {
    return {
      headline: `${f.monthLabel}: satış kaydı yok`,
      summary: `${f.monthLabel} ayında programda tamamlanmış satış yok. Rapor, satışlar kasadan girildikçe dolacak.`,
      scorecard: [],
      sections: [],
      staffSummary: staff.summary,
      staff: [],
      targetsComment: "Hedefler satış verisi oluştukça hesaplanır.",
      actions,
      risks: [],
      nextMonthFocus: "Bütün satışları kasadan girmek ve her akşam günü kapatmak.",
    };
  }

  // Başlık: ciro yönü + en önemli konu
  const ch = f.changes.revenue;
  const lead =
    ch === null
      ? `${f.monthLabel}${f.isPartial ? " (ara)" : ""}: ciro ${TL(k.revenueGrossKurus)}`
      : `${f.monthLabel}${f.isPartial ? " (ara)" : ""}: ciro ${signed(ch)} ${upDown(ch)}`;
  const issue = !top
    ? k.netProfitKurus > 0
      ? `net kâr ${TL(k.netProfitKurus)}`
      : `brüt kâr ${TL(k.grossProfitKurus)}`
    : top.key === "price-erosion"
      ? `${f.products.erosion.length} ürünün fiyatı maliyete göre güncellenmeli`
      : top.key === "price-below-cost"
        ? "zararına satılan ürünler var"
        : top.key === "stock-out"
          ? "biten ürünler satış kaçırıyor"
          : top.key === "cash-shortage"
            ? "kasa açıkları dikkat istiyor"
            : top.key === "target-pace"
              ? "hedefin gerisinde, tempo artmalı"
              : k.netProfitKurus < 0 && k.expensesNetKurus > 0
                ? "giderler kârı aşıyor"
                : top.title.charAt(0).toLocaleLowerCase("tr") + top.title.slice(1);
  const headline = `${lead}; ${issue}`;

  // Yönetici özeti
  const s: string[] = [];
  s.push(
    `${f.monthLabel}${f.isPartial ? ` (${f.elapsedDays}/${f.daysInMonth} gün)` : ""} cirosu ${TL(k.revenueGrossKurus)}${ch !== null ? `, önceki aya göre ${signed(ch)}` : ""}; ${k.saleCount} satış, ortalama sepet ${k.avgBasketKurus === null ? "—" : TL(k.avgBasketKurus)}.`,
  );
  s.push(
    `Brüt kâr ${TL(k.grossProfitKurus)} (marj ${pct(k.marginPermille)})${k.expensesNetKurus > 0 ? `; ${TL(k.expensesNetKurus)} gider sonrası net ${k.netProfitKurus >= 0 ? "kâr" : "zarar"} ${TL(Math.abs(k.netProfitKurus))}` : "; gider girilmediği için net kâr hesaplanamadı"}.`,
  );
  const weak = sections.filter((x) => x.grade === "zayif").map((x) => x.title.toLocaleLowerCase("tr"));
  const good = sections.filter((x) => x.grade === "iyi").map((x) => x.title.toLocaleLowerCase("tr"));
  if (good.length) s.push(`İyi giden alanlar: ${good.slice(0, 4).join(", ")}.`);
  if (weak.length) s.push(`Öncelikli düzeltilecek alanlar: ${weak.join(", ")}.`);
  if (input.potential.maxKurus > 0) s.push(`Aşağıdaki aksiyonlar uygulanırsa aylık ${TL(input.potential.minKurus)} – ${TL(input.potential.maxKurus)} ek kâr potansiyeli var${top ? `; en büyük adım: ${top.title.charAt(0).toLocaleLowerCase("tr") + top.title.slice(1)}` : ""}.`);
  if (f.dataQuality.historyDays < 28) s.push("Program kısa süredir kullanıldığı için karşılaştırmalar sınırlı; değerlendirme her ay güçlenecek.");

  // Hedefler
  const tc: string[] = [];
  if (f.targets.length) {
    if (f.isPartial) {
      const behind = f.targets.filter((t) => t.status === "behind").map((t) => METRIC_SHORT[t.metric]);
      tc.push(behind.length ? `Bu ay şu hedeflerin gerisindesiniz: ${behind.join(", ")}.` : "Bu ayın hedefleri yolunda ya da önünde.");
      const rev = f.targets.find((t) => t.metric === "revenue");
      if (rev?.forecast != null) tc.push(`Ciro ay sonu tahmini ${TL(rev.forecast)}, hedef ${TL(rev.target)}.`);
    } else {
      const hit = f.targets.filter((t) => (METRIC_INFO[t.metric].lowerIsBetter ? t.actual <= t.target : t.actual >= t.target));
      tc.push(`${f.targets.length} hedeften ${hit.length} tanesi tuttu${hit.length < f.targets.length ? ` (tutmayanlar: ${f.targets.filter((t) => !hit.includes(t)).map((t) => METRIC_SHORT[t.metric]).join(", ")})` : ""}.`);
    }
  }
  const nr = input.nextTargets.find((t) => t.metric === "revenue");
  if (nr) {
    const g = nr.baseline > 0 ? mulDivRound(nr.target - nr.baseline, 1000, nr.baseline) : null;
    tc.push(`${monthLabel(shiftMonth(f.month, 1))} ciro hedefi ${TL(nr.target)} (bugünkü gidişin ${signed(g)} üstü). ${nr.rationale} Ulaşmanın yolu: fiyat düzeltmeleri, biten ürünleri tamamlamak ve sepeti büyütmek.`);
  }

  // Gelecek ayın odağı
  const focusByKey: Record<string, string> = {
    "price-erosion": "Maliyeti artan ürünlerin fiyatını güncelleyip marjı geri almak.",
    "price-below-cost": "Zararına satılan ürün bırakmamak.",
    "stock-out": "Çok satan hiçbir ürünü bitirmemek.",
    "cash-shortage": "Kasa açığını sıfırlamak.",
    "target-pace": "Kalan günlerde ciro temposunu hedefe çıkarmak.",
    "basket-size": "Her fişe bir ürün daha eklemek (sepeti büyütmek).",
    "okc-diff": "Her satışın yazar kasa fişini kesmek.",
  };
  const nextMonthFocus = top
    ? (focusByKey[top.key] ?? (top.key.startsWith("expense-") ? "Ortalamanın üstüne çıkan gideri geri indirmek." : `${ACTION_AREA_LABELS[top.area]}: ${top.title}.`))
    : k.netProfitKurus < 0 && k.expensesNetKurus > 0
      ? "Giderleri karşılayacak ciroya ulaşmak."
      : "Ciroyu hedefe taşımak ve marjı korumak.";

  return {
    headline,
    summary: s.join(" "),
    scorecard: [...sections.map((x) => ({ area: x.area, grade: x.grade, comment: x.comment })), { area: "personel" as const, grade: staff.grade, comment: staff.summary.split(". ")[0]! + "." }],
    sections: sections.map((x) => ({ area: x.area, title: x.title, findings: x.findings, opportunity: x.opportunity })),
    staffSummary: staff.summary,
    staff: staff.people.map(({ alias, assessment, strengths, improve }) => ({ alias, assessment, strengths, improve })),
    targetsComment: tc.join(" ") || "Hedefler satış verisi oluştukça hesaplanır.",
    actions,
    risks: risks(f),
    nextMonthFocus,
  };
}
