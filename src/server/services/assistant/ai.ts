/**
 * Aylık rapor yorumu: yerleşik asistan + (varsa) merkezi yapay zekâ.
 *
 * - Yerleşik asistan (narrative.ts) her zaman çalışır: bu bilgisayarda, internetsiz, hesapsız.
 * - Merkezi yapay zekâ: Optiva servisi (mail-service/, yazılım sahibinin tek Anthropic hesabı) Claude ile yorumu güçlendirir.
 *   Dükkânda hesap ya da anahtar gerekmez; servis adresi tanımlıysa ve yönetici kapatmadıysa kullanılır.
 *   Servise yalnızca hesaplanmış rakamlar gider (TL/% metin, kasiyerler takma adla, işletme adı yok); istemi servis kendisi kurar.
 * - Servis yoksa, internet yoksa ya da sınır dolduysa yerleşik yorum kalır.
 */
import { AiReportSchema, sanitizeAiReport, type AiPayload, type AiReport } from "@/lib/assistantAi";
import { formatPermille, formatTRY } from "@/lib/money";
import type { Ctx } from "../../context";
import type { DB } from "../../db/types";
import { getRawSetting, setRawSetting } from "../../db/repositories/settings";
import { AppError } from "../../errors";
import { decryptSecret, encryptSecret } from "../../mail";
import { ensureServiceInstall, mailServiceAvailable, serviceAiMonthly } from "../../mail/service";
import { parseInput, z } from "../../validation/zod";
import { audit } from "../audit";
import type { PlanAction } from "./actions";
import type { MonthlyFacts } from "./facts";
import { buildLocalReport } from "./narrative";
import type { TargetProposal } from "./targets";

export type { AiReport };
const CLOUD_SETTING = "ai_cloud_enabled";

export interface AiInput {
  facts: MonthlyFacts;
  ruleActions: PlanAction[];
  nextTargets: TargetProposal[];
  potential: { minKurus: number; maxKurus: number };
}

// ------------------------------------------------------------------ durum

export interface AiStatus {
  /** Merkezi yapay zekâ bu kurulumda mevcut mu (servis adresi tanımlı) */
  cloudAvailable: boolean;
  /** Yönetici kapatmadıysa açık */
  cloudEnabled: boolean;
}

export function getAiStatus(db: DB): AiStatus {
  return { cloudAvailable: mailServiceAvailable() || testRunner !== null, cloudEnabled: getRawSetting(db, CLOUD_SETTING) !== "false" };
}

/** Bu raporda merkezi yapay zekâ denenecek mi? */
export function cloudAiActive(db: DB): boolean {
  const s = getAiStatus(db);
  return s.cloudAvailable && s.cloudEnabled;
}

const settingsSchema = z.object({ cloudEnabled: z.boolean() });

/** Yönetici merkezi yapay zekâyı açar/kapatır (kapalıyken veri servise hiç gitmez). */
export function saveAiSettings(ctx: Ctx, input: unknown): AiStatus {
  const data = parseInput(settingsSchema, input);
  ctx.db
    .transaction(() => {
      setRawSetting(ctx.db, CLOUD_SETTING, data.cloudEnabled ? "true" : "false");
      audit(ctx, "assistant.ai", data.cloudEnabled ? "Bulut yapay zekâ yorumu açıldı" : "Bulut yapay zekâ yorumu kapatıldı");
    })
    .immediate();
  return getAiStatus(ctx.db);
}

// ------------------------------------------------------------------ veri paketi

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

/** Servise gidecek veri paketi (yerleşik asistanın taslağı dahil). */
export function buildAiPayload(input: AiInput, draft: AiReport): AiPayload {
  const money = (metric: string, v: number) => (metric === "margin" ? formatPermille(v) : metric === "sale_count" ? String(v) : formatTRY(v));
  return {
    monthLabel: input.facts.monthLabel,
    isPartial: input.facts.isPartial,
    rapor: presentForAi(input.facts) as Record<string, unknown>,
    ruleActions: presentForAi(input.ruleActions) as unknown[],
    toplamKarPotansiyeli: { enAzTL: formatTRY(input.potential.minKurus), enCokTL: formatTRY(input.potential.maxKurus) },
    nextTargets: input.nextTargets.map((t) => ({ hedef: t.metric, taban: money(t.metric, t.baseline), deger: money(t.metric, t.target), gerekce: t.rationale })),
    taslak: draft,
  };
}

// ------------------------------------------------------------------ yorum üretimi

export class AiOutputError extends Error {}

export type AiRunner = (payload: AiPayload, db: DB) => Promise<{ report: unknown; model: string }>;
let testRunner: AiRunner | null = null;
/** Testler merkezi servis yerine sahte yanıt verir. */
export function setTestAiRunner(r: AiRunner | null): void {
  testRunner = r;
}

const serviceRunner: AiRunner = async (payload, db) => {
  const creds = await ensureServiceInstall(db, { encrypt: encryptSecret, decrypt: decryptSecret });
  return serviceAiMonthly(creds, payload);
};

/** Yerleşik asistanın yorumu (her zaman, anında). */
export function generateLocalReport(input: AiInput): AiReport {
  return buildLocalReport(input);
}

/** Merkezi yapay zekânın yorumu; yanıt şemaya uymazsa hata. */
export async function generateCloudReport(db: DB, input: AiInput, draft: AiReport): Promise<{ report: AiReport; model: string }> {
  const runner = testRunner ?? serviceRunner;
  const { report, model } = await runner(buildAiPayload(input, draft), db);
  const parsed = AiReportSchema.safeParse(report);
  if (!parsed.success) throw new AiOutputError("Yapay zekâ yanıtı beklenen biçimde değil.");
  const ruleKeys = new Set(input.ruleActions.map((a) => a.key));
  const aliases = new Set(input.facts.staff.members.map((m) => m.alias));
  return { report: sanitizeAiReport(parsed.data, ruleKeys, aliases), model: model || "claude" };
}

/** Hataları yöneticinin anlayacağı Türkçe mesaja çevirir. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof AiOutputError || e instanceof AppError) return e.message;
  return "Bulut yapay zekâ yorumu alınamadı.";
}
