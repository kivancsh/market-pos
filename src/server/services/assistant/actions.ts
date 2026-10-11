/**
 * Kural tabanlı aksiyon önerileri (yapay zekâ olmadan da çalışır). Her öneri: ne yapılacak, neden (rakamla),
 * nasıl (adımlar), aylık etki aralığı (₺) ve nasıl ölçüleceği. Etki tahminleri bilerek temkinlidir (aralık).
 * Yapay zekâ bu listeyi önceliklendirir, birleştirir ve kendi önerilerini ekler.
 */
import { type ActionArea } from "@/lib/assistant";
import { divRound, formatPermille, formatTRY, mulDivRound } from "@/lib/money";
import type { MonthlyFacts, PriceLine } from "./facts";

export type ActionPriority = "yuksek" | "orta" | "dusuk";
export const PRIORITY_LABELS: Record<ActionPriority, string> = { yuksek: "Yüksek", orta: "Orta", dusuk: "Düşük" };

/** Etki türü: aylık brüt kâr artışı, nakde dönüşen stok ya da önlenen kayıp. */
export type ImpactKind = "profit" | "cash" | "risk";
export const IMPACT_KIND_LABELS: Record<ImpactKind, string> = { profit: "aylık ek kâr", cash: "nakde dönüşecek stok", risk: "önlenecek kayıp" };

export interface PlanAction {
  key: string;
  area: ActionArea;
  priority: ActionPriority;
  title: string;
  why: string;
  steps: string[];
  impactMinKurus: number | null;
  impactMaxKurus: number | null;
  impactKind: ImpactKind | null;
  /** Nasıl ölçülür (bir sonraki raporda neye bakılacak) */
  measure: string;
}

const pct = (permille: number | null) => formatPermille(permille);
const range = (v: number, minPm: number, maxPm: number) => ({ impactMinKurus: mulDivRound(v, minPm, 1000), impactMaxKurus: mulDivRound(v, maxPm, 1000) });
const priceList = (lines: PriceLine[], n = 5) => lines.slice(0, n).map((l) => `${l.name}: ${formatTRY(l.priceKurus)} → ${formatTRY(l.suggestedPriceKurus)} (alış ${formatTRY(l.avgCostKurus)})`);
const RANK: Record<ActionPriority, number> = { yuksek: 0, orta: 1, dusuk: 2 };

/** Kurallardan aksiyon listesi (öncelik ve etkiye göre sıralı). */
export function buildRuleActions(f: MonthlyFacts): PlanAction[] {
  const out: PlanAction[] = [];
  const k = f.kpi;
  // KDV dahil ciroyu kâra çevirmek için kaba oran: brüt kâr / KDV dahil ciro
  const profitPerRevenue = k.revenueGrossKurus > 0 ? mulDivRound(Math.max(0, k.grossProfitKurus), 1000, k.revenueGrossKurus) : 0;

  // 1) Hedef gidişatı (ara rapor)
  const rev = f.targets.find((t) => t.metric === "revenue");
  if (f.isPartial && rev && rev.status === "behind" && f.daysInMonth > f.elapsedDays) {
    const left = f.daysInMonth - f.elapsedDays;
    const need = Math.max(0, rev.target - rev.actual);
    out.push({
      key: "target-pace",
      area: "satis",
      priority: "yuksek",
      title: "Ciro hedefinin gerisindesiniz — kalan günlerde temponun artması gerekiyor",
      why: `Bugüne kadar ${formatTRY(rev.actual)} ciro yapıldı; bu tarihe kadar beklenen ${formatTRY(rev.expectedToDate ?? 0)}. Ay sonu tahmini ${formatTRY(rev.forecast ?? rev.actual)}, hedef ${formatTRY(rev.target)}.`,
      steps: [
        `Kalan ${left} günde günlük ortalama ${formatTRY(divRound(need, left))} ciro gerekiyor.`,
        "En çok satan ürünlerin stokta ve görünür yerde olduğundan emin olun.",
        "Aşağıdaki fiyat ve sepet önerilerini öncelikle uygulayın.",
      ],
      impactMinKurus: null,
      impactMaxKurus: null,
      impactKind: null,
      measure: "Yapay zekâ asistanı ekranındaki hedef gidişatı (her gün güncellenir).",
    });
  }

  // 2) Zararına satış
  const neg = f.products.negativeMargin;
  if (neg.length > 0) {
    const gain = neg.reduce((a, l) => a + l.monthlyGainKurus, 0);
    out.push({
      key: "price-below-cost",
      area: "fiyat",
      priority: "yuksek",
      title: `${neg.length} ürün alış fiyatının altında ya da maliyetine satılıyor`,
      why: "Bu ürünlerin her satışı zarar yazıyor; çoğunlukla alış fiyatı arttığı hâlde satış fiyatı güncellenmemiştir.",
      steps: [...priceList(neg), "Ürünler ekranından fiyatı güncelleyin; etiketleri yeniden basın."],
      ...range(gain, 700, 1000),
      impactKind: "profit",
      measure: "Sonraki raporda bu ürünlerin marjı pozitife dönmeli.",
    });
  }

  // 3) Maliyet artışı → fiyat aşınması
  const ero = f.products.erosion;
  if (ero.length > 0) {
    const gain = ero.reduce((a, l) => a + l.monthlyGainKurus, 0);
    out.push({
      key: "price-erosion",
      area: "fiyat",
      priority: gain >= 100_000 ? "yuksek" : "orta",
      title: `Alış fiyatı artan ${ero.length} ürünün satış fiyatını güncelleyin`,
      why: `Bu ürünlerde maliyet arttı ama fiyat aynı kaldı; birim marj geçen aya göre düştü (ör. ${ero[0]!.name}: ${pct(ero[0]!.prevMarginPermille)} → ${pct(ero[0]!.currentMarginPermille)}).`,
      steps: [...priceList(ero), "Önerilen fiyat, geçen ayki marjı geri getirir (50 kuruşa yuvarlandı). Toplu fiyat ekranı ile tek seferde yapılabilir."],
      ...range(gain, 600, 1000),
      impactKind: "profit",
      measure: "Bu ürünlerin marjı geçen ayki seviyeye dönmeli; satış adedi %10'dan fazla düşmemeli.",
    });
  }

  // 4) Çok satan ama düşük marjlı (A sınıfı)
  const stars = f.products.lowMarginStars;
  if (stars.length > 0) {
    const gain = stars.reduce((a, l) => a + l.monthlyGainKurus, 0);
    out.push({
      key: "price-star-margin",
      area: "fiyat",
      priority: "orta",
      title: `En çok satan ${stars.length} üründe küçük (%4) fiyat ayarı`,
      why: "Cironun büyük kısmını bu ürünler getiriyor ama marjları %15'in altında. Küçük bir ayar müşteriye fark ettirmeden kârı belirgin artırır.",
      steps: [...priceList(stars), "Önce 2 hafta deneyin; satış adedi belirgin düşerse eski fiyata dönün."],
      ...range(gain, 500, 900),
      impactKind: "profit",
      measure: "Ürün kârlılığı raporunda bu ürünlerin marjı ve adedi.",
    });
  }

  // 5) Biten / bitmek üzere olan çok satanlar
  const oos = f.stock.outOfStock;
  if (oos.length > 0 || f.stock.urgent.length > 0) {
    const weekly = oos.reduce((a, o) => a + o.lostProfitPerWeekKurus, 0);
    out.push({
      key: "stock-out",
      area: "stok",
      priority: oos.length > 0 ? "yuksek" : "orta",
      title: oos.length > 0 ? `Satılan ${oos.length} ürün stokta yok — kaçan satış` : `${f.stock.urgent.length} ürün 1 hafta içinde bitecek`,
      why:
        oos.length > 0
          ? `Bu ürünler son 30 günde satıldı ama şu an stokta yok. Haftada yaklaşık ${formatTRY(weekly)} brüt kâr kaçıyor.`
          : "Son 30 günün satış hızına göre bu ürünler bir hafta içinde bitecek.",
      steps: [
        ...oos.slice(0, 5).map((o) => `${o.name}: stok bitti (günde ~${Math.floor(o.dailyAvgTenths / 10)},${o.dailyAvgTenths % 10} adet satılıyordu)`),
        ...f.stock.urgent.slice(0, 5).map((u) => `${u.name}: ${u.stockQty} adet kaldı, önerilen sipariş ${u.suggestQty}`),
        "Raporlar → Sipariş önerisi listesini tedarikçiye gönderin; asgari stok seviyelerini gözden geçirin.",
      ],
      ...(weekly > 0 ? range(weekly * 4, 500, 1000) : { impactMinKurus: null, impactMaxKurus: null }),
      impactKind: weekly > 0 ? "risk" : null,
      measure: "Sonraki raporda 'stokta yok' listesi boş olmalı.",
    });
  }

  // 6) Satılmayan stok
  if (f.stock.dead.count > 0 && f.stock.dead.valueAtCostKurus >= 50_000) {
    out.push({
      key: "dead-stock",
      area: "stok",
      priority: f.stock.dead.valueAtCostKurus >= 500_000 ? "orta" : "dusuk",
      title: `${f.stock.dead.count} ürün 30 gündür hiç satılmadı — ${formatTRY(f.stock.dead.valueAtCostKurus)} para rafta bekliyor`,
      why: "Satılmayan stok nakit bağlar ve raf yerini çok satanlardan alır.",
      steps: [
        ...f.stock.dead.items.slice(0, 5).map((d) => `${d.name}: ${d.stockQty} adet (${formatTRY(d.valueAtCostKurus)})`),
        "Kasaya yakın bir 'fırsat' sepetine alın ya da çok satan bir ürünle ikili paket yapın.",
        "Bu ürünleri bir daha sipariş etmeyin; gerekirse tedarikçiye iade edin.",
      ],
      ...range(f.stock.dead.valueAtCostKurus, 400, 700),
      impactKind: "cash",
      measure: "Satılmayan stok değeri bir sonraki raporda azalmalı.",
    });
  }

  // 7) Giderler ortalamanın üstünde
  for (const c of f.expenses.byCategory) {
    if (c.avg3NetKurus === null || c.avg3NetKurus <= 0) continue;
    const excess = c.netKurus - c.avg3NetKurus;
    if (excess >= 50_000 && c.netKurus * 1000 > c.avg3NetKurus * 1200) {
      out.push({
        key: `expense-${c.category}`,
        area: "gider",
        priority: excess >= 300_000 ? "orta" : "dusuk",
        title: `${c.label} gideri son 3 ay ortalamasının ${pct(mulDivRound(excess, 1000, c.avg3NetKurus))} üstünde`,
        why: `Bu ay ${formatTRY(c.netKurus)}, ortalama ${formatTRY(c.avg3NetKurus)} (KDV hariç).`,
        steps: ["Faturayı kontrol edin: tek seferlik mi, tarife mi değişti?", "Tekrarlıyorsa alternatif teklif alın ya da kullanımı azaltın."],
        ...range(excess, 300, 800),
        impactKind: "profit",
        measure: `Gelecek ay ${c.label} gideri ${formatTRY(c.avg3NetKurus)} civarına inmeli.`,
      });
    }
  }

  // 8) İndirim kaçağı
  if (k.discountRatePermille !== null && k.discountRatePermille > 30 && k.discountKurus >= 20_000) {
    const netDiscount = k.revenueGrossKurus > 0 ? mulDivRound(k.discountKurus, k.revenueNetKurus, k.revenueGrossKurus) : k.discountKurus;
    out.push({
      key: "discount-leak",
      area: "fiyat",
      priority: k.discountRatePermille > 60 ? "orta" : "dusuk",
      title: `İndirimler satışların ${pct(k.discountRatePermille)}'i — ${formatTRY(k.discountKurus)}`,
      why: "İndirim doğrudan kârdan gider. Planlı kampanya dışındaki indirimler kontrol edilmeli.",
      steps: ["Kasiyer performansı raporunda kimin ne kadar indirim yaptığına bakın.", "Ayarlar'da kasiyer indirim yetkisini yalnız gerekiyorsa açık tutun."],
      ...range(netDiscount, 200, 500),
      impactKind: "profit",
      measure: "İndirim oranı %3'ün altına inmeli.",
    });
  }

  // 9) Sepet büyütme (birlikte alınan ürünler)
  const pairs = f.basket.pairs.filter((p) => p.liftHundredths >= 150 && p.together >= 5);
  if (k.saleCount >= 50 && k.grossProfitKurus > 0) {
    out.push({
      key: "basket-size",
      area: "satis",
      priority: "orta",
      title: "Sepeti büyütün: birlikte alınan ürünleri yan yana koyun, kasada öneri yapın",
      why: `Ortalama sepet ${k.avgBasketKurus === null ? "—" : formatTRY(k.avgBasketKurus)}; fiş başına ${k.itemsPerBasketTenths === null ? "—" : `${Math.floor(k.itemsPerBasketTenths / 10)},${k.itemsPerBasketTenths % 10}`} ürün. Sepetin %2–3 büyümesi ciroyu doğrudan artırır.`,
      steps: [
        ...pairs.slice(0, 3).map((p) => `${p.a} + ${p.b}: ${p.together} fişte birlikte (beklenenin ${Math.floor(p.liftHundredths / 100)},${String(p.liftHundredths % 100).padStart(2, "0")} katı) — yan yana koyun ya da ikili fiyat yapın.`),
        "Kasiyerler ödeme öncesi tek bir yan ürün önersin (ör. sakız, içecek, pil).",
        "Kasanın önüne küçük, kârlı ürünler koyun.",
      ],
      ...range(k.grossProfitKurus, 15, 30),
      impactKind: "profit",
      measure: "Ortalama sepet ve fiş başına ürün sayısı.",
    });
  }

  // 10) Zayıf hafta günü
  const days = f.time.weekdays.filter((d) => d.avgPerDayKurus !== null && d.saleCount > 0);
  if (days.length >= 5) {
    const avg = divRound(days.reduce((a, d) => a + d.avgPerDayKurus!, 0), days.length);
    const weak = [...days].sort((a, b) => a.avgPerDayKurus! - b.avgPerDayKurus!)[0]!;
    const best = [...days].sort((a, b) => b.avgPerDayKurus! - a.avgPerDayKurus!)[0]!;
    if (avg > 0 && weak.avgPerDayKurus! * 1000 < avg * 700) {
      const gapRevenue = (mulDivRound(avg, 850, 1000) - weak.avgPerDayKurus!) * 4;
      out.push({
        key: "weak-weekday",
        area: "musteri",
        priority: "dusuk",
        title: `${weak.day} günleri zayıf: günlük ${formatTRY(weak.avgPerDayKurus!)} (ortalama ${formatTRY(avg)})`,
        why: `En iyi gün ${best.day} (${formatTRY(best.avgPerDayKurus!)}). Zayıf günü ortalamaya yaklaştırmak ek ciro getirir.`,
        steps: [`${weak.day} gününe özel küçük bir kampanya deneyin (ör. çok satan tek bir üründe “${weak.day} fırsatı”).`, "Bu gün personel sayısını azaltıp maliyeti düşürmeyi de düşünün."],
        ...range(mulDivRound(gapRevenue, profitPerRevenue, 1000), 300, 600),
        impactKind: "profit",
        measure: `${weak.day} günlük ortalama cirosu.`,
      });
    }
  }

  // 11) Saatler: yoğun ve sessiz saatler
  if (f.time.peakHours.length > 0 && k.saleCount >= 50) {
    const h = (x: number) => `${String(x).padStart(2, "0")}:00`;
    out.push({
      key: "hours",
      area: "personel",
      priority: "dusuk",
      title: `Yoğun saatler: ${[...f.time.peakHours].sort((a, b) => a - b).map(h).join(", ")}${f.time.quietHours.length ? ` · sessiz saatler: ${f.time.quietHours.map(h).join(", ")}` : ""}`,
      why: "Yoğun saatte kasa beklemesi satış kaçırır; sessiz saatte fazla personel maliyettir.",
      steps: [
        "Yoğun saatten önce rafları doldurun, mümkünse ikinci kişi kasada olsun.",
        ...(f.time.quietHours.length ? ["Sessiz saatlerde raf düzeni, sayım ve sipariş işlerini yapın; vardiyaları bu saatlere göre kaydırın."] : []),
      ],
      impactMinKurus: null,
      impactMaxKurus: null,
      impactKind: null,
      measure: "Yoğun saatlerdeki satış sayısı.",
    });
  }

  // 12) Personel
  const team = f.staff.team;
  for (const m of f.staff.members) {
    if (m.role === "owner") continue;
    // Kişi, ekibin geri kalanıyla karşılaştırılır (kendi rakamı ortalamayı çekmesin)
    const othersSales = team.saleCount - m.saleCount;
    const othersVoidRate = othersSales + team.voidCount - m.voidCount > 0 ? mulDivRound(team.voidCount - m.voidCount, 1000, othersSales + team.voidCount - m.voidCount) : 0;
    const othersSalesTotal = team.salesTotalKurus - m.salesTotalKurus;
    const othersDiscount = team.discountKurus - m.discountKurus;
    const othersDiscountRate = othersSalesTotal + othersDiscount > 0 ? mulDivRound(othersDiscount, 1000, othersSalesTotal + othersDiscount) : 0;
    const othersBasket = othersSales > 0 ? divRound(othersSalesTotal, othersSales) : null;
    if (m.voidRatePermille !== null && m.voidCount >= 3 && m.voidRatePermille > Math.max(30, 2 * othersVoidRate)) {
      out.push({
        key: `staff-void-${m.alias}`,
        area: "personel",
        priority: m.voidRatePermille > 60 ? "yuksek" : "orta",
        title: `${m.alias}: satış iptali oranı yüksek (${pct(m.voidRatePermille)}, ekibin geri kalanı ${pct(othersVoidRate)})`,
        why: `${m.voidCount} iptal. Sık iptal; okutma hatası, eğitim eksikliği ya da kasa açığına yol açan bir alışkanlık olabilir.`,
        steps: ["İşlem geçmişinden iptallerin saatlerine ve nedenlerine bakın.", "Kasiyerle birlikte doğru okutma ve iptal adımlarını tekrar edin.", "Gün sonu kasa farklarıyla karşılaştırın."],
        impactMinKurus: null,
        impactMaxKurus: null,
        impactKind: "risk",
        measure: `${m.alias} iptal oranı ekip ortalamasına inmeli.`,
      });
    }
    if (m.discountRatePermille !== null && m.discountKurus >= 20_000 && m.discountRatePermille > Math.max(30, 2 * othersDiscountRate)) {
      out.push({
        key: `staff-discount-${m.alias}`,
        area: "personel",
        priority: "orta",
        title: `${m.alias}: indirim oranı ekibin üstünde (${pct(m.discountRatePermille)})`,
        why: `Toplam ${formatTRY(m.discountKurus)} indirim yapıldı.`,
        steps: ["İndirimlerin hangi ürün ve müşterilere yapıldığını konuşun.", "İndirim kuralını yazılı hâle getirin."],
        ...range(m.discountKurus, 200, 500),
        impactKind: "profit",
        measure: `${m.alias} indirim oranı.`,
      });
    }
    if (othersBasket !== null && m.avgBasketKurus !== null && m.saleCount >= 30 && m.avgBasketKurus * 1000 < othersBasket * 800) {
      const gap = (othersBasket - m.avgBasketKurus) * m.saleCount;
      out.push({
        key: `staff-basket-${m.alias}`,
        area: "personel",
        priority: "dusuk",
        title: `${m.alias}: ortalama sepet ekibin geri kalanından %20'den fazla düşük`,
        why: `${m.alias} ${formatTRY(m.avgBasketKurus)}, ekibin geri kalanı ${formatTRY(othersBasket)}. Vardiya saatleri farklı olabilir; yine de yan ürün önerisi fark yaratır.`,
        steps: ["Kasada tek yan ürün önerme alışkanlığını birlikte çalışın.", "Bir ay sonra sepet ortalamasını karşılaştırın."],
        ...range(mulDivRound(gap, profitPerRevenue, 1000), 100, 300),
        impactKind: "profit",
        measure: `${m.alias} ortalama sepeti.`,
      });
    }
  }

  // 13) Kasa açıkları
  const c = f.cash;
  if (c.shortageKurus >= 20_000 || c.shortageDays >= 3) {
    out.push({
      key: "cash-shortage",
      area: "kasa",
      priority: c.shortageKurus >= 100_000 ? "yuksek" : "orta",
      title: `Kasa açığı: ${c.shortageDays} günde toplam ${formatTRY(c.shortageKurus)}`,
      why: `${c.countedDays} günlük sayımın ${c.shortageDays}'inde kasa eksik çıktı${c.excessKurus > 0 ? `; ${c.excessDays} gün fazla (${formatTRY(c.excessKurus)})` : ""}. Tekrarlayan açık; para üstü hatası, kayıt dışı iade ya da kayıp olabilir.`,
      steps: ["Vardiya değişiminde kasayı birlikte sayın.", "Açık çıkan günlerde kimin kasada olduğunu ve iptal/iade işlemlerini kontrol edin.", "Nakitte 'alınan para'nın girilmesini zorunlu alışkanlık yapın."],
      ...range(c.shortageKurus, 500, 1000),
      impactKind: "risk",
      measure: "Kasa farkı toplamı sıfıra yaklaşmalı.",
    });
  }
  if (c.daysWithSalesNotClosed >= 3) {
    out.push({
      key: "close-days",
      area: "kasa",
      priority: "dusuk",
      title: `${c.daysWithSalesNotClosed} gün kapatılmadı — kasa sayımı yapılmadı`,
      why: "Günü kapatmadan kasa açığı ya da fazlası görülemez.",
      steps: ["Her akşam Bugün ve gün sonu → Günü Kapat ile sayılan nakdi girin."],
      impactMinKurus: null,
      impactMaxKurus: null,
      impactKind: null,
      measure: "Kapatılmayan gün sayısı 0 olmalı.",
    });
  }
  if (c.okcDiffPermille !== null && Math.abs(c.okcDiffPermille) > 50) {
    out.push({
      key: "okc-diff",
      area: "kasa",
      priority: "yuksek",
      title: `Yazar kasa Z toplamı programdan ${pct(c.okcDiffPermille)} farklı`,
      why: `Z toplamı ${formatTRY(c.okcZTotalKurus)}, program ${formatTRY(c.okcExpectedKurus)}. Fişi kesilmeyen satış yasal risktir.`,
      steps: ["Her satışın yazar kasadan da fişinin kesildiğini kontrol edin.", "Mümkünse yazar kasayı programa bağlayın (Ayarlar → Yazar kasa)."],
      impactMinKurus: null,
      impactMaxKurus: null,
      impactKind: "risk",
      measure: "Z farkı %5'in altında olmalı.",
    });
  }

  // 14) İadeler
  const badReturns = f.returns.topProducts.filter((r) => r.returnedQty >= 3 && r.ratePermille !== null && r.ratePermille > 100);
  if (badReturns.length > 0) {
    out.push({
      key: "returns",
      area: "urun",
      priority: "dusuk",
      title: `Sık iade edilen ürünler: ${badReturns.map((r) => r.name).join(", ")}`,
      why: badReturns.map((r) => `${r.name}: ${r.soldQty} satıştan ${r.returnedQty} iade`).join("; "),
      steps: ["Ürün kusurlu mu, son kullanma tarihi yakın mı kontrol edin.", "Tedarikçiyle konuşun ya da ürünü değiştirin."],
      impactMinKurus: null,
      impactMaxKurus: null,
      impactKind: null,
      measure: "Bu ürünlerin iade oranı.",
    });
  }

  // 15) Düşen ürünler
  const fallers = f.products.fallers.filter((p) => p.prevQty >= 10 && p.qty * 1000 < p.prevQty * 700);
  if (fallers.length > 0) {
    out.push({
      key: "fallers",
      area: "urun",
      priority: "dusuk",
      title: `Satışı belirgin düşen ürünler: ${fallers.slice(0, 3).map((p) => p.name).join(", ")}`,
      why: fallers.slice(0, 4).map((p) => `${p.name}: ${p.prevQty} → ${p.qty} adet`).join("; "),
      steps: ["Rafta görünür mü, stokta var mı?", "Yakındaki rakibin fiyatıyla karşılaştırın.", "Mevsimsel düşüşse siparişi azaltın."],
      impactMinKurus: null,
      impactMaxKurus: null,
      impactKind: null,
      measure: "Bu ürünlerin aylık satış adedi.",
    });
  }

  // 16) Veri eksikleri
  if (f.dataQuality.notes.some((n) => n.includes("alış fiyatı 0"))) {
    out.push({
      key: "data-cost",
      area: "urun",
      priority: "orta",
      title: "Bazı ürünlerin alış fiyatı girilmemiş",
      why: "Alış fiyatı 0 olan ürünlerin kârı olduğundan yüksek görünür; kararlar yanlış rakama dayanır.",
      steps: ["Ürünler ekranında alış fiyatı 0 olanları düzeltin ya da mal girişiyle güncel alış fiyatını girin."],
      impactMinKurus: null,
      impactMaxKurus: null,
      impactKind: null,
      measure: "Alış fiyatı 0 olan ürün kalmamalı.",
    });
  }
  if (f.expenses.totalNetKurus === 0 && !f.isPartial) {
    out.push({
      key: "data-expenses",
      area: "gider",
      priority: "dusuk",
      title: "Bu ay hiç gider girilmemiş — net kâr eksik hesaplanıyor",
      why: "Kira, personel, faturalar girilmeden gerçek kâr görülemez.",
      steps: ["Muhasebe → Giderler ekranından ayın giderlerini girin."],
      impactMinKurus: null,
      impactMaxKurus: null,
      impactKind: null,
      measure: "Kâr-zarar ekranında net kâr.",
    });
  }

  return out.sort((a, b) => RANK[a.priority] - RANK[b.priority] || (b.impactMaxKurus ?? 0) - (a.impactMaxKurus ?? 0));
}

/** Kâr türündeki önerilerin toplam etki aralığı. */
export function profitPotential(actions: PlanAction[]): { minKurus: number; maxKurus: number } {
  const p = actions.filter((a) => a.impactKind === "profit");
  return { minKurus: p.reduce((s, a) => s + (a.impactMinKurus ?? 0), 0), maxKurus: p.reduce((s, a) => s + (a.impactMaxKurus ?? 0), 0) };
}
