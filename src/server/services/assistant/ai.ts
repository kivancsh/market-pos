/**
 * Claude ile aylık yorum ve aksiyon planı.
 *
 * - Model: claude-opus-5-5, uyarlanabilir düşünme (adaptive), yüksek özen (effort "high").
 * - Yanıt şemaya bağlı (yapılandırılmış çıktı) → ekranda ve e-postada güvenle gösterilir.
 * - Sunucu tarafı yedek (fallbacks "default"): Claude bir isteği güvenlik sınıflandırıcısı yüzünden geri çevirirse
 *   Anthropic isteği önerilen başka bir modelde yeniden çalıştırır.
 * - Yapay zekâya yalnızca hesaplanmış rakamlar gider (biçimlendirilmiş TL/yüzde). Kasiyer adları gitmez ("Kasiyer 1001").
 * - Anahtar yoksa ya da internet yoksa rapor yine oluşur (yerel analiz + kural tabanlı öneriler).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ACTION_AREAS, ANALYSIS_AREAS } from "@/lib/assistant";
import { formatPermille, formatTRY } from "@/lib/money";
import type { Ctx } from "../../context";
import type { DB } from "../../db/types";
import { deleteRawSetting, getRawSetting, setRawSetting } from "../../db/repositories/settings";
import { badRequest } from "../../errors";
import { decryptSecret, encryptSecret } from "../../mail";
import { parseInput } from "../../validation/zod";
import { audit } from "../audit";
import type { PlanAction } from "./actions";
import type { MonthlyFacts } from "./facts";
import type { TargetProposal } from "./targets";

export const AI_MODEL = "claude-opus-5-5";
const KEY_SETTING = "ai_api_key_enc";
const ENABLED_SETTING = "ai_enabled";

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
        week: z.enum(["1. hafta", "2. hafta", "3. hafta", "4. hafta", "Ay boyunca"]),
        ruleKey: z.string().nullable().describe("Kural tabanlı öneriden geliyorsa onun anahtarı; yoksa null"),
      }),
    )
    .describe("Aylık alınabilecek aksiyonlar: 5-8 adet, önem sırasıyla"),
  risks: z.array(z.string()).describe("Dikkat edilmesi gereken 1-4 risk"),
  nextMonthFocus: z.string().describe("Gelecek ayın tek ana odağı, bir cümle"),
});
export type AiReport = z.infer<typeof AiReportSchema>;

// ------------------------------------------------------------------ anahtar ve açma/kapama

export function getAiKey(db: DB): string | null {
  const blob = getRawSetting(db, KEY_SETTING);
  return blob ? decryptSecret(blob) : null;
}

export interface AiStatus {
  configured: boolean;
  enabled: boolean;
  /** Anahtarın son 4 karakteri (tanımak için) */
  keyHint: string | null;
  model: string;
}

export function getAiStatus(db: DB): AiStatus {
  const key = getAiKey(db);
  return { configured: !!key, enabled: !!key && getRawSetting(db, ENABLED_SETTING) !== "false", keyHint: key ? `…${key.slice(-4)}` : null, model: AI_MODEL };
}

export function aiEnabled(db: DB): boolean {
  return getAiStatus(db).enabled || testRunner !== null;
}

const aiSettingsSchema = z.object({
  apiKey: z.string().trim().max(300).optional(),
  enabled: z.boolean().optional(),
  remove: z.literal(true).optional(),
});

/** Yönetici anahtarı girer / kaldırır / yorumu açıp kapatır. Anahtar girildiğinde önce Anthropic'te denenir. */
export async function saveAiSettings(ctx: Ctx, input: unknown): Promise<AiStatus> {
  const data = parseInput(aiSettingsSchema, input);
  if (data.remove) {
    ctx.db
      .transaction(() => {
        deleteRawSetting(ctx.db, KEY_SETTING);
        audit(ctx, "assistant.ai", "Yapay zekâ bağlantısı kaldırıldı");
      })
      .immediate();
    return getAiStatus(ctx.db);
  }
  if (data.apiKey) {
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(data.apiKey)) throw badRequest("BAD_KEY", "Anahtar “sk-ant-” ile başlamalı. Anthropic Console’dan kopyalayın.");
    await testAiKey(data.apiKey);
    ctx.db
      .transaction(() => {
        setRawSetting(ctx.db, KEY_SETTING, encryptSecret(data.apiKey!));
        setRawSetting(ctx.db, ENABLED_SETTING, "true");
        audit(ctx, "assistant.ai", "Yapay zekâ bağlantısı kuruldu");
      })
      .immediate();
  }
  if (data.enabled !== undefined) {
    ctx.db
      .transaction(() => {
        setRawSetting(ctx.db, ENABLED_SETTING, data.enabled ? "true" : "false");
        audit(ctx, "assistant.ai", data.enabled ? "Yapay zekâ yorumu açıldı" : "Yapay zekâ yorumu kapatıldı");
      })
      .immediate();
  }
  return getAiStatus(ctx.db);
}

/** Anahtarı ücretsiz bir istekle (model bilgisi) dener. */
async function testAiKey(apiKey: string): Promise<void> {
  if (testRunner) return;
  try {
    await new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 }).models.retrieve(AI_MODEL);
  } catch (e) {
    throw badRequest("AI_KEY_FAILED", aiErrorMessage(e));
  }
}

/** Anthropic hatalarını yöneticinin anlayacağı Türkçe mesaja çevirir. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "API anahtarı geçersiz ya da silinmiş. Yapay zekâ ayarlarından yeniden girin.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Bu anahtarın modele erişim izni yok (Anthropic Console → hesap ayarlarını kontrol edin).";
  if (e instanceof Anthropic.NotFoundError) return "Model bulunamadı; programı güncelleyin.";
  if (e instanceof Anthropic.RateLimitError) return "Anthropic kullanım sınırına ulaşıldı; biraz sonra yeniden denenecek.";
  if (e instanceof Anthropic.APIConnectionError) return "İnternet bağlantısı yok ya da Anthropic'e ulaşılamadı; bağlantı gelince yeniden denenecek.";
  if (e instanceof Anthropic.BadRequestError) {
    return /credit|balance|billing/i.test(e.message)
      ? "Anthropic hesabında kredi kalmamış. Console → Billing'den yükleme yapın."
      : "İstek reddedildi. Programı güncelleyip yeniden deneyin.";
  }
  if (e instanceof Anthropic.InternalServerError) return "Anthropic servisi şu an yoğun; biraz sonra yeniden denenecek.";
  if (e instanceof AiOutputError) return e.message;
  return "Yapay zekâ yorumu alınamadı.";
}

export class AiOutputError extends Error {}

// ------------------------------------------------------------------ istem

/** Verideki para/oran alanlarını okunur metne çevirir (yapay zekâ rakamları aynen kullanabilsin). */
export function presentForAi(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => presentForAi(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "id" || k === "aliasNames" || k === "businessName" || k === "version" || k === "generatedAt") continue;
      const name = k.replace(/Kurus$/, "TL").replace(/Permille$/, "Yuzde").replace(/Tenths$/, "").replace(/Hundredths$/, "Kat");
      out[name] = presentForAi(v, k);
    }
    return out;
  }
  if (typeof value === "number") {
    if (key.endsWith("Kurus")) return formatTRY(value);
    if (key.endsWith("Permille")) return formatPermille(value);
    if (key.endsWith("Tenths")) return `${value < 0 ? "-" : ""}${Math.floor(Math.abs(value) / 10)},${Math.abs(value) % 10}`;
    if (key.endsWith("Hundredths")) return `${Math.floor(value / 100)},${String(value % 100).padStart(2, "0")}`;
  }
  return value;
}

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
hangi aksiyonlarla ulaşılacağını anlat. Hedefleri değiştirme.`;

export function buildUserPrompt(input: { facts: MonthlyFacts; ruleActions: PlanAction[]; nextTargets: TargetProposal[]; potential: { minKurus: number; maxKurus: number } }): string {
  const payload = {
    rapor: presentForAi(input.facts),
    ruleActions: presentForAi(input.ruleActions.map((a) => ({ ...a, impactKind: a.impactKind }))),
    toplamKarPotansiyeli: { enAzTL: formatTRY(input.potential.minKurus), enCokTL: formatTRY(input.potential.maxKurus) },
    nextTargets: input.nextTargets.map((t) => ({
      hedef: t.metric,
      taban: t.metric === "margin" ? formatPermille(t.baseline) : t.metric === "sale_count" ? t.baseline : formatTRY(t.baseline),
      deger: t.metric === "margin" ? formatPermille(t.target) : t.metric === "sale_count" ? t.target : formatTRY(t.target),
      gerekce: t.rationale,
    })),
  };
  return `Aşağıda ${input.facts.monthLabel} ayının${input.facts.isPartial ? " (henüz bitmedi, ara rapor)" : ""} verisi var. Bu veriye dayanarak aylık raporu hazırla.

<veri>
${JSON.stringify(payload, null, 1)}
</veri>`;
}

// ------------------------------------------------------------------ çağrı

export interface AiRunInput {
  system: string;
  user: string;
}
export type AiRunner = (input: AiRunInput, apiKey: string) => Promise<{ report: AiReport; model: string }>;

let testRunner: AiRunner | null = null;
/** Testler gerçek API yerine sahte yanıt verir. */
export function setTestAiRunner(r: AiRunner | null): void {
  testRunner = r;
}

const claudeRunner: AiRunner = async ({ system, user }, apiKey) => {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 15 * 60_000 });
  const stream = client.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 32_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(AiReportSchema) },
    system,
    messages: [{ role: "user", content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new AiOutputError("Yapay zekâ bu raporu yorumlamadı (güvenlik filtresi). Yerel analiz ve öneriler geçerli.");
  if (msg.stop_reason === "max_tokens") throw new AiOutputError("Yapay zekâ yanıtı yarıda kesildi; yeniden deneyin.");
  if (!msg.parsed_output) throw new AiOutputError("Yapay zekâ yanıtı okunamadı; yeniden deneyin.");
  return { report: msg.parsed_output, model: msg.model };
};

/** Yorumu üretir; şemaya uymayan alanları temizler (bilinmeyen takma ad, olmayan kural anahtarı). */
export async function generateAiReport(
  db: DB,
  input: { facts: MonthlyFacts; ruleActions: PlanAction[]; nextTargets: TargetProposal[]; potential: { minKurus: number; maxKurus: number } },
): Promise<{ report: AiReport; model: string }> {
  const runner = testRunner ?? claudeRunner;
  const key = testRunner ? "test" : getAiKey(db);
  if (!key) throw new AiOutputError("Yapay zekâ bağlantısı kurulmamış.");
  const { report, model } = await runner({ system: SYSTEM_PROMPT, user: buildUserPrompt(input) }, key);
  const ruleKeys = new Set(input.ruleActions.map((a) => a.key));
  const aliases = new Set(input.facts.staff.members.map((m) => m.alias));
  return {
    model,
    report: {
      ...report,
      staff: report.staff.filter((s) => aliases.has(s.alias)),
      actions: report.actions.map((a) => ({ ...a, ruleKey: a.ruleKey && ruleKeys.has(a.ruleKey) ? a.ruleKey : null })),
    },
  };
}
