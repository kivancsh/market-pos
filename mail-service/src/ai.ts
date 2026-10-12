/**
 * Merkezi yapay zekâ: aylık rapor yorumu için Claude çağrısı (yazılım sahibinin tek Anthropic hesabı; dükkânlarda hesap yok).
 * - Model claude-opus-5-5, uyarlanabilir düşünme, yüksek özen, şemaya bağlı çıktı (Zod).
 * - Sunucu tarafı yedek (fallbacks "default", beta server-side-fallback-2026-07-01): Claude bir isteği güvenlik sınıflandırıcısı
 *   yüzünden geri çevirirse Anthropic isteği önerilen başka bir modelde yeniden çalıştırır.
 * - İstem sabittir (src/lib/assistantAi.ts); programdan yalnızca veri paketi gelir.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiReportSchema, CLOUD_AI_MODEL, SYSTEM_PROMPT, buildUserPrompt, type AiPayload, type AiReport } from "../../src/lib/assistantAi";

export class AiFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function runClaudeMonthly(apiKey: string, payload: AiPayload): Promise<{ report: AiReport; model: string }> {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 5 * 60_000 });
  let msg;
  try {
    const stream = client.beta.messages.stream({
      model: CLOUD_AI_MODEL,
      max_tokens: 32_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(AiReportSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(payload) }],
    });
    msg = await stream.finalMessage();
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    if (status === 429 || (status !== undefined && status >= 500)) throw new AiFailure("AI_BUSY", "Yapay zekâ şu an yoğun; biraz sonra yeniden denenecek.", 503);
    throw new AiFailure("AI_FAILED", "Yapay zekâ yorumu alınamadı.");
  }
  if (msg.stop_reason === "refusal") throw new AiFailure("AI_REFUSED", "Yapay zekâ bu raporu yorumlamadı; yerleşik yorum geçerli.");
  if (msg.stop_reason === "max_tokens" || !msg.parsed_output) throw new AiFailure("AI_FAILED", "Yapay zekâ yanıtı tamamlanamadı; yeniden denenecek.");
  return { report: msg.parsed_output, model: msg.model };
}
