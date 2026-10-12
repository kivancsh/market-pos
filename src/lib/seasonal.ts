/**
 * Perakende mevsim takvimi (Türkiye): ay başına satışı etkileyen dönemler ve hazırlık önerileri.
 * Yerleşik asistan, raporun ardından gelen ay için bunlardan aksiyon üretir. Dini bayram tarihleri hicri takvime göre
 * her yıl ~11 gün öne kayar; aşağıdaki tarihler yaklaşıktır (kesin tarih: Diyanet takvimi).
 */

export interface SeasonalItem {
  title: string;
  steps: string[];
}

const MONTHLY: Record<number, SeasonalItem[]> = {
  1: [
    {
      title: "Ocak: yılbaşı sonrası durgunluk ve kış",
      steps: ["Çay, sıcak içecek, çorba ve hijyen ürünlerini göz hizasına alın.", "Sömestr tatilinde (ay sonu) kırtasiye siparişini azaltın."],
    },
  ],
  2: [{ title: "Şubat: Sevgililer Günü (14 Şubat)", steps: ["Çikolata ve küçük hediyelik ürünleri 10 Şubat'tan itibaren kasaya yakın koyun.", "Kış ürünlerinin stoğunu ay sonuna doğru azaltın."] }],
  3: [{ title: "Mart: bahar temizliği", steps: ["Temizlik ürünlerini (deterjan, çamaşır suyu, sünger) öne alın, birlikte satılanları yan yana koyun."] }],
  4: [{ title: "Nisan: ilk sıcaklar ve 23 Nisan", steps: ["Soğuk içecek ve su stoğunu artırmaya başlayın.", "Okul çevresindeyseniz 23 Nisan öncesi atıştırmalık ve içecek talebi artar."] }],
  5: [
    {
      title: "Mayıs: Anneler Günü ve sıcaklar",
      steps: ["Anneler Günü (Mayıs'ın 2. Pazarı) öncesi çikolata ve hediyelik ürünleri öne alın.", "Su ve soğuk içecek stoğunu yaz seviyesine çıkarın."],
    },
  ],
  6: [
    {
      title: "Haziran: okullar kapanıyor, yaz başlıyor",
      steps: ["Su, soğuk içecek ve dondurma stoğunu artırın; dolapların çalıştığını kontrol edin.", "Babalar Günü (Haziran'ın 3. Pazarı) için küçük hediyelikler."],
    },
  ],
  7: [{ title: "Temmuz: en sıcak ay", steps: ["Su ve soğuk içecek stoğunu bir haftalık değil iki haftalık tutun; bitmesi en pahalı kayıptır.", "Öğle sıcağında sessiz saatleri raf ve sipariş işlerine ayırın."] }],
  8: [{ title: "Ağustos: okul alışverişi yaklaşıyor", steps: ["Ay sonuna doğru kırtasiye (kalem, defter) siparişini artırın.", "Sıcak devam ediyor: içecek stoğunu koruyun."] }],
  9: [{ title: "Eylül: okulların açılışı", steps: ["Kırtasiye ve beslenme çantası ürünlerini (küçük meyve suyu, bisküvi, gofret) öne alın.", "Sabah okul saatinde kasada ikinci kişi bulundurun."] }],
  10: [{ title: "Ekim: havalar soğuyor", steps: ["Çay, kahve ve sıcak içecek ürünlerini öne alın; soğuk içecek siparişini azaltın.", "29 Ekim tatili öncesi temel gıda talebi artar."] }],
  11: [
    {
      title: "Kasım: kış hazırlığı ve indirim günleri",
      steps: ["Çay, çorba, makarna, hijyen ürünlerinin stoğunu artırın.", "Ay sonundaki indirim günlerinde büyük marketlerle fiyat yarışına girmeyin; hızlı ve yakın olmanın avantajını kullanın."],
    },
  ],
  12: [{ title: "Aralık: yılbaşı", steps: ["Kuruyemiş, çikolata ve içecek stoğunu yılbaşından iki hafta önce artırın.", "Yıl sonu stok sayımını planlayın (Stok sayımı ekranı)."] }],
};

/** Yaklaşık bayram başlangıçları (yıl → [Ramazan Bayramı, Kurban Bayramı], "AA-GG"). */
const BAYRAM: Record<number, [string, string]> = {
  2026: ["03-20", "05-27"],
  2027: ["03-10", "05-17"],
  2028: ["02-27", "05-05"],
  2029: ["02-15", "04-24"],
  2030: ["02-05", "04-13"],
};

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const day = (mmdd: string) => `${Number(mmdd.slice(3))} ${MONTHS[Number(mmdd.slice(0, 2)) - 1]}`;

/** "YYYY-MM" ayı için mevsim önerileri (bayramlar dahil). */
export function seasonalItems(month: string): SeasonalItem[] {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const out = [...(MONTHLY[m] ?? [])];
  const b = BAYRAM[y];
  if (b) {
    const [ramazan, kurban] = b;
    const rm = Number(ramazan.slice(0, 2));
    // Ramazan ayı bayramdan ~30 gün önce başlar: bayram ayı ve bir önceki ay
    if (rm === m || rm - 1 === m) {
      out.push({
        title: `Ramazan${rm === m ? ` ve Ramazan Bayramı (yaklaşık ${day(ramazan)})` : " başlıyor"}`,
        steps: [
          "İftar öncesi saatte (akşamüstü) yoğunluk olur: o saatte kasada ikinci kişi bulundurun.",
          "Hurma, pide yanı ürünler, su, süt ürünleri ve içecek stoğunu artırın.",
          ...(rm === m ? ["Bayram öncesi şeker, çikolata ve kolonya talebi artar; bir hafta önceden stoklayın."] : []),
        ],
      });
    }
    if (Number(kurban.slice(0, 2)) === m) {
      out.push({
        title: `Kurban Bayramı (yaklaşık ${day(kurban)})`,
        steps: ["Mangal kömürü, içecek, baharat, ekmek ve tek kullanımlık tabak/bardak stoğunu bayramdan önce artırın.", "Bayram günleri çalışma saatlerini ve personel planını önceden duyurun."],
      });
    }
  }
  return out;
}
