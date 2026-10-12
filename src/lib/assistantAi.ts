/**
 * Aylık rapor yorumu — program ile merkezi servis (mail-service/) arasında ortak tanımlar.
 * Rapor yorumunun biçimi (şema), Claude'a verilen sabit sistem istemi ve servise gönderilen veri paketi burada.
 * Merkezi servis istemi kendisi kurar (programdan serbest metin almaz): servis yalnızca bu iş için kullanılabilir.
 */
import { z } from "zod";
import { ACTION_AREAS, ANALYSIS_AREAS } from "./assistant";

/** Merkezi serviste kullanılan model. */
export const CLOUD_AI_MODEL = "claude-opus-5-5";
/** Yerleşik asistanın (bu bilgisayarda, internetsiz) model etiketi. */
export const LOCAL_AI_MODEL = "market-kasa-yerel";
/** Servise gönderilen veri paketinin üst sınırı. */
export const AI_PAYLOAD_MAX_BYTES = 400_000;

export const WEEKS = ["1. hafta", "2. hafta", "3. hafta", "4. hafta", "Ay boyunca"] as const;

export const AiReportSchema = z.object({
  headline: z.string().describe("Ayı tek cümleyle özetleyen başlık"),
  summary: z.string().describe("Yönetici özeti: 4-6 cümle, en önemli rakamlar ve genel değerlendirme"),
  scorecard: z
    .array(
      z.object({
        area: z.enum(ANALYSIS_AREAS),
        grade: z.enum(["iyi", "orta", "zayif"]),
        comment: z.string().describe("Tek cümle, rakamla"),
      }),
    )
    .describe("Her analiz alanı için bir not"),
  sections: z
    .array(
      z.object({
        area: z.enum(ANALYSIS_AREAS),
        title: z.string(),
        findings: z.array(z.string()).describe("2-4 tespit, rakamlarla"),
        opportunity: z.string().describe("Bu alandaki en büyük fırsat"),
      }),
    )
    .describe("İşletmenin her kalemi için ayrıntılı analiz"),
  staffSummary: z.string().describe("Ekibin genel değerlendirmesi"),
  staff: z.array(
    z.object({
      alias: z.string().describe("Verideki takma ad, aynen (ör. 'Kasiyer 1001')"),
      assessment: z.string(),
      strengths: z.array(z.string()),
      improve: z.array(z.string()),
    }),
  ),
  targetsComment: z.string().describe("Bu ayın hedef gerçekleşmesi ve gelecek ay hedeflerinin neden gerçekçi olduğu"),
  actions: z
    .array(
      z.object({
        title: z.string().describe("Emir kipiyle, somut: hangi ürün/gün/kişi"),
        why: z.string().describe("Rakamla gerekçe"),
        steps: z.array(z.string()).describe("2-4 uygulanabilir adım"),
        expectedImpact: z.string().describe("Beklenen etki; verideki etki aralığını kullan ya da 'ölçülemez' de"),
        measure: z.string().describe("Gelecek ay neye bakılarak başarı ölçülecek"),
        priority: z.enum(["yuksek", "orta", "dusuk"]),
        area: z.enum(ACTION_AREAS),
        week: z.enum(WEEKS),
        ruleKey: z.string().nullable().describe("Kural tabanlı öneriden geliyorsa onun anahtarı; yoksa null"),
      }),
    )
    .describe("Aylık alınabilecek aksiyonlar: 5-8 adet, önem sırasıyla"),
  risks: z.array(z.string()).describe("Dikkat edilmesi gereken 1-4 risk"),
  nextMonthFocus: z.string().describe("Gelecek ayın tek ana odağı, bir cümle"),
});
export type AiReport = z.infer<typeof AiReportSchema>;

/** Servise giden veri: yalnızca hesaplanmış, biçimlendirilmiş rakamlar (kasiyerler takma adla, işletme adı yok). */
export const AiPayloadSchema = z.object({
  monthLabel: z.string().max(40),
  isPartial: z.boolean(),
  rapor: z.record(z.string(), z.unknown()),
  ruleActions: z.array(z.unknown()).max(40),
  toplamKarPotansiyeli: z.object({ enAzTL: z.string().max(40), enCokTL: z.string().max(40) }),
  nextTargets: z.array(z.unknown()).max(10),
  /** Yerleşik asistanın taslağı: Claude bunu geliştirir */
  taslak: z.unknown().optional(),
});
export type AiPayload = z.infer<typeof AiPayloadSchema>;

export const SYSTEM_PROMPT = `Sen küçük ve orta ölçekli Türk perakende işletmeleri (market, büfe, tekel, kırtasiye, şarküteri) için çalışan deneyimli bir iş danışmanısın.
"Market Kasa" programının aylık yapay zekâ asistanı olarak, dükkân sahibine ay sonu raporu ve bir sonraki ay için aksiyon planı hazırlıyorsun.

Okuyucu: yazılımcı ya da finansçı değil, dükkânın sahibi. Sade, saygılı, doğrudan Türkçe yaz. Teknik terim kullanma; gerekiyorsa bir cümleyle açıkla.
Amaç: işletmenin daha çok para kazanması. Her öneri somut olmalı: hangi ürün, hangi fiyat, hangi gün, hangi kişi, ne zamana kadar.

Rakam kuralları (çok önemli):
- Yalnızca verilen veride bulunan rakamları kullan. Rakam uydurma, tahmin edip kesinmiş gibi yazma.
- Verideki TL ve yüzde değerlerini aynen yaz. Basit bir fark ya da oran hesaplarsan "yaklaşık" de.
- Etki tahmini için kural tabanlı önerilerdeki etki aralıklarını kullan; aralığı olmayan öneride "etkisi ölçülerek görülecek" de.
- Veri az ya da eksikse (dataQuality notları) bunu açıkça söyle ve sonuçları temkinli yorumla.

Analiz: işletmenin her kalemine bak — ciro, kâr ve marj, ürünler, kategoriler, fiyat/maliyet değişimi, stok, giderler, gün/saat dağılımı,
sepet, iade/iptal, kasa sayımı, personel. Önceki ay, geçen yılın aynı ayı (varsa) ve hedeflerle karşılaştır. Ay bitmemişse (isPartial) bunu belirt
ve gidişatı değerlendir.

Personel: kişiler yalnız takma adlarıyla geçer ("Kasiyer 1001", "Yönetici"); bu adları aynen kullan, başka isim üretme. Adil ol: vardiya saati ve
çalışılan gün sayısı farkını göz önünde tut. Suçlayıcı değil, geliştirici dil kullan. Hem güçlü yönleri hem gelişim alanlarını yaz.

Aksiyonlar ("Aylık alınabilecek aksiyonlar"): 5-8 tane, önem ve ₺ etkiye göre sırala. Kural tabanlı önerileri (ruleActions) temel al;
gerekirse birleştir, sadeleştir, ruleKey alanına anahtarını yaz. Verinin gösterdiği ama kurallarda olmayan fırsatları da ekleyebilirsin
(ruleKey null); mevsim ve Türkiye'deki dönemsel alışkanlıklar (okul dönemi, bayramlar, kış/yaz ürünleri) gibi bilgiyi kullanabilirsin ama
rakam uydurma. Her aksiyona bir hafta ata (1.-4. hafta ya da "Ay boyunca") ki sahibi ayı planlayabilsin.

Hedefler: nextTargets gelecek ay için hesaplanmış gerçekçi hedeflerdir. targetsComment'te bu ayın hedef sonucunu ve gelecek ay hedeflerine
hangi aksiyonlarla ulaşılacağını anlat. Hedefleri değiştirme.

Taslak: veride "taslak" varsa, programın kendi kurallarıyla yazdığı ön rapordur. Ondaki doğru tespitleri koru; daha derin bağlantılar kur
(ör. hangi sorun hangisini besliyor), önceliği gerekçelendir ve dili bir danışman gibi toparla.`;

/** Servisin Claude'a verdiği kullanıcı mesajı (veri paketi sabit bir çerçeve içinde). */
export function buildUserPrompt(payload: AiPayload): string {
  return `Aşağıda ${payload.monthLabel} ayının${payload.isPartial ? " (henüz bitmedi, ara rapor)" : ""} verisi var. Bu veriye dayanarak aylık raporu hazırla.

<veri>
${JSON.stringify(payload, null, 1)}
</veri>`;
}

/** Şemaya uyan ama veriyle çelişen alanları temizler (bilinmeyen takma ad, olmayan kural anahtarı). */
export function sanitizeAiReport(report: AiReport, ruleKeys: Set<string>, aliases: Set<string>): AiReport {
  return {
    ...report,
    staff: report.staff.filter((s) => aliases.has(s.alias)),
    actions: report.actions.map((a) => ({ ...a, ruleKey: a.ruleKey && ruleKeys.has(a.ruleKey) ? a.ruleKey : null })),
  };
}
