/**
 * Yapay zekâ asistanı — aylık rapor akışı.
 *
 * 1) Yerel analiz (facts) + kural tabanlı aksiyonlar + gelecek ayın gerçekçi hedefleri hesaplanır ve kaydedilir;
 *    yerleşik asistan (narrative.ts) bütün yorumu ve haftalık planı hemen yazar (internetsiz, hesapsız).
 * 2) Market Kasa servisi tanımlıysa bulut yapay zekâ (Claude) bu rakamlardan yorumu güçlendirir (rakam üretmez); olmazsa yerleşik yorum kalır.
 * 3) Ay bitince (ertesi ayın ilk açılışında) rapor otomatik oluşturulur ve yöneticilere e-postayla gider.
 * Ay sürerken "ara rapor" istenebilir; ay bitince son hâliyle yenilenir.
 */
import { ACTION_AREA_LABELS, isMonth, monthLabel, shiftMonth, type ActionArea, type ActionStatus } from "@/lib/assistant";
import { endOfMonth } from "@/lib/businessDate";
import { formatTRY, mulDivRound } from "@/lib/money";
import type { Ctx } from "../../context";
import {
  getMonthlyReport,
  listActionStatuses,
  listMonthlyReports,
  listTargets,
  markMonthlyEmailed,
  saveLocalAi,
  saveMonthlyAi,
  saveMonthlyAiError,
  setActionStatus,
  upsertMonthlyFacts,
  type MonthlyReportRow,
} from "../../db/repositories/assistant";
import { getPeriodSummary } from "../../db/repositories/reports";
import { listActiveOwnerEmails } from "../../db/repositories/users";
import { AppError, badRequest, conflict, notFound } from "../../errors";
import { isMailConfigured, sendMail } from "../../mail";
import { parseInput, z } from "../../validation/zod";
import { audit } from "../audit";
import { todayOf } from "../dayClosing";
import { IMPACT_KIND_LABELS, PRIORITY_LABELS, buildRuleActions, profitPotential, type ActionPriority, type PlanAction } from "./actions";
import { LOCAL_AI_MODEL } from "@/lib/assistantAi";
import { aiErrorMessage, cloudAiActive, generateCloudReport, generateLocalReport, getAiStatus, type AiReport, type AiStatus } from "./ai";
import { buildMonthlyEmail } from "./email";
import { buildMonthlyFacts, type MonthlyFacts } from "./facts";
import { ensureTargets, getTargetProgress, proposeTargets, saveAutoTargets, type TargetProposal } from "./targets";

export interface StoredFacts {
  facts: MonthlyFacts;
  ruleActions: PlanAction[];
  nextTargets: TargetProposal[];
  potential: { minKurus: number; maxKurus: number };
  aliasNames: Record<string, string>;
}

export interface DisplayAction {
  key: string;
  source: "ai" | "rule";
  title: string;
  why: string;
  steps: string[];
  impact: string | null;
  measure: string;
  priority: ActionPriority;
  priorityLabel: string;
  area: ActionArea;
  areaLabel: string;
  week: string | null;
  status: ActionStatus;
}

export interface MonthlyReportView {
  month: string;
  monthLabel: string;
  periodTo: string;
  isPartial: boolean;
  createdAt: string;
  updatedAt: string;
  facts: MonthlyFacts;
  ruleActions: PlanAction[];
  nextTargets: TargetProposal[];
  potential: { minKurus: number; maxKurus: number };
  aliasNames: Record<string, string>;
  ai: AiReport | null;
  aiModel: string | null;
  aiGeneratedAt: string | null;
  aiError: string | null;
  /** Yorumu kim yazdı: yerleşik asistan ya da bulut yapay zekâ */
  aiSource: "local" | "cloud" | null;
  emailedAt: string | null;
  plan: DisplayAction[];
}

function impactText(a: PlanAction): string | null {
  if (a.impactMinKurus === null || a.impactMaxKurus === null || !a.impactKind) return null;
  return `${formatTRY(a.impactMinKurus)} – ${formatTRY(a.impactMaxKurus)} ${IMPACT_KIND_LABELS[a.impactKind]}`;
}

/** Ekranda gösterilecek plan: yapay zekânın planı (varsa), yoksa kural tabanlı öneriler. */
export function buildPlan(stored: StoredFacts, ai: AiReport | null, statuses: Map<string, ActionStatus>): DisplayAction[] {
  const byKey = new Map(stored.ruleActions.map((a) => [a.key, a]));
  const items: Omit<DisplayAction, "status" | "priorityLabel" | "areaLabel">[] = ai
    ? ai.actions.map((a, i) => {
        const rule = a.ruleKey ? byKey.get(a.ruleKey) : undefined;
        const ruleImpact = rule ? impactText(rule) : null;
        return {
          key: a.ruleKey ?? `ai-${i + 1}`,
          source: "ai" as const,
          title: a.title,
          why: a.why,
          steps: a.steps,
          impact: ruleImpact ?? a.expectedImpact,
          measure: a.measure,
          priority: a.priority,
          area: a.area,
          week: a.week,
        };
      })
    : stored.ruleActions.slice(0, 10).map((a) => ({
        key: a.key,
        source: "rule" as const,
        title: a.title,
        why: a.why,
        steps: a.steps,
        impact: impactText(a),
        measure: a.measure,
        priority: a.priority,
        area: a.area,
        week: null,
      }));
  // Aynı anahtar iki kez gelirse (yapay zekâ bir kuralı ikiye bölmüş) ikinciyi ayrı tut
  const seen = new Set<string>();
  return items.map((it, i) => {
    const key = seen.has(it.key) ? `${it.key}-${i + 1}` : it.key;
    seen.add(key);
    return { ...it, key, priorityLabel: PRIORITY_LABELS[it.priority], areaLabel: ACTION_AREA_LABELS[it.area], status: statuses.get(key) ?? "open" };
  });
}

export function toView(ctx: Ctx, row: MonthlyReportRow): MonthlyReportView {
  const stored = JSON.parse(row.factsJson) as StoredFacts;
  const ai = row.aiJson ? (JSON.parse(row.aiJson) as AiReport) : null;
  const statuses = new Map(listActionStatuses(ctx.db, row.month).map((s) => [s.actionKey, s.status]));
  return {
    month: row.month,
    monthLabel: monthLabel(row.month),
    periodTo: row.periodTo,
    isPartial: row.isPartial,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...stored,
    ai,
    aiModel: row.aiModel,
    aiGeneratedAt: row.aiGeneratedAt,
    aiError: row.aiError,
    aiSource: row.aiJson ? (row.aiModel === LOCAL_AI_MODEL ? "local" : "cloud") : null,
    emailedAt: row.emailedAt,
    plan: buildPlan(stored, ai, statuses),
  };
}

export function getMonthlyReportView(ctx: Ctx, month: string): MonthlyReportView | null {
  const row = getMonthlyReport(ctx.db, month);
  return row ? toView(ctx, row) : null;
}

// ------------------------------------------------------------------ oluşturma

const g = globalThis as unknown as { __assistantRunning?: Set<string> };
const running = (g.__assistantRunning ??= new Set<string>());

export function isGenerating(month: string): boolean {
  return running.has(month);
}

async function withLock<T>(month: string, fn: () => Promise<T>): Promise<T> {
  if (running.has(month)) throw conflict("REPORT_RUNNING", "Bu ayın raporu şu an hazırlanıyor. Birkaç dakika sonra sayfayı yenileyin.");
  running.add(month);
  try {
    return await fn();
  } finally {
    running.delete(month);
  }
}

/** Yerel analizi yapar ve kaydeder (yapay zekâ yorumu sonra eklenir). */
export function computeAndStore(ctx: Ctx, month: string): StoredFacts {
  const today = todayOf(ctx);
  if (month > today.slice(0, 7)) throw badRequest("FUTURE_MONTH", "Gelecek ayın raporu oluşturulamaz.");
  const currentTargets = month === today.slice(0, 7) ? ensureTargets(ctx, month) : listTargets(ctx.db, month);
  const prev = getMonthlyReportView(ctx, shiftMonth(month, -1));
  const priorActions = prev ? { month: prev.month, items: prev.plan.map((p) => ({ key: p.key, title: p.title, status: p.status })) } : null;
  const { facts, aliasNames } = buildMonthlyFacts(ctx, month, { targets: getTargetProgress(ctx, month, currentTargets), priorActions });
  const ruleActions = buildRuleActions(facts);
  const potential = profitPotential(ruleActions);
  let nextTargets: TargetProposal[] = [];
  const nextMonth = shiftMonth(month, 1);
  if (!facts.isPartial) {
    // Fiyat düzeltmelerinden beklenen en az kâr → ulaşılabilir marj artışı (en çok 1 puan)
    const priceGain = ruleActions.filter((a) => a.area === "fiyat" && a.impactKind === "profit").reduce((s, a) => s + (a.impactMinKurus ?? 0), 0);
    const boost = facts.kpi.revenueNetKurus > 0 ? Math.min(10, mulDivRound(priceGain, 1000, facts.kpi.revenueNetKurus)) : 0;
    nextTargets = proposeTargets(ctx, nextMonth, facts.to, boost);
  }
  const stored: StoredFacts = { facts, ruleActions, nextTargets, potential, aliasNames };
  const nowIso = ctx.now().toISOString();
  ctx.db
    .transaction(() => {
      upsertMonthlyFacts(ctx.db, month, facts.to, facts.isPartial, JSON.stringify(stored), nowIso);
      // Yerleşik asistanın yorumu hemen yazılır (internetsiz, hesapsız); bulut yorumu gelirse üzerine yazılır
      saveLocalAi(ctx.db, month, JSON.stringify(generateLocalReport(stored)), LOCAL_AI_MODEL, nowIso);
      // Gelecek ayın hedefleri: yalnız henüz başlamamış ya da süren ay için (geçmişin hedefi değişmez)
      if (nextTargets.length && nextMonth >= today.slice(0, 7)) saveAutoTargets(ctx, nextMonth, nextTargets);
      audit(ctx, "assistant.report", `${monthLabel(month)} ${facts.isPartial ? "ara raporu" : "raporu"} oluşturuldu`);
    })
    .immediate();
  return stored;
}

/** Kayıtlı rapora bulut yapay zekâ yorumu ekler (yerleşik yorumu taslak olarak verir). Hata olursa kaydeder, fırlatmaz. */
export async function addCloudCommentary(ctx: Ctx, month: string): Promise<{ ok: boolean; error?: string }> {
  const row = getMonthlyReport(ctx.db, month);
  if (!row) throw notFound("NO_REPORT", "Bu ay için rapor yok.");
  const stored = JSON.parse(row.factsJson) as StoredFacts;
  const draft = row.aiJson && row.aiModel === LOCAL_AI_MODEL ? (JSON.parse(row.aiJson) as AiReport) : generateLocalReport(stored);
  try {
    const { report, model } = await generateCloudReport(ctx.db, stored, draft);
    ctx.db.transaction(() => saveMonthlyAi(ctx.db, month, JSON.stringify(report), model, ctx.now().toISOString())).immediate();
    return { ok: true };
  } catch (e) {
    const message = aiErrorMessage(e);
    if (!(e instanceof AppError)) console.error("[yapay zekâ]", e instanceof Error ? e.message : e);
    ctx.db.transaction(() => saveMonthlyAiError(ctx.db, month, message, ctx.now().toISOString())).immediate();
    return { ok: false, error: message };
  }
}

export const generateSchema = z.object({ month: z.string().refine(isMonth, "Geçersiz ay."), ai: z.boolean().optional() });

/** Yönetici "Raporu oluştur"a bastığında. */
export async function generateMonthlyReport(ctx: Ctx, input: unknown): Promise<MonthlyReportView> {
  const data = parseInput(generateSchema, input);
  return withLock(data.month, async () => {
    computeAndStore(ctx, data.month);
    if (data.ai !== false && cloudAiActive(ctx.db)) await addCloudCommentary(ctx, data.month);
    return getMonthlyReportView(ctx, data.month)!;
  });
}

export async function retryAi(ctx: Ctx, month: string): Promise<MonthlyReportView> {
  if (!cloudAiActive(ctx.db)) throw badRequest("AI_OFF", "Bulut yapay zekâ bu kurulumda kapalı; yerleşik asistanın yorumu geçerli.");
  return withLock(month, async () => {
    await addCloudCommentary(ctx, month);
    return getMonthlyReportView(ctx, month)!;
  });
}

// ------------------------------------------------------------------ aksiyon durumu

const actionSchema = z.object({
  month: z.string().refine(isMonth, "Geçersiz ay."),
  key: z.string().min(1).max(120),
  status: z.enum(["open", "done", "skipped"]),
});

export function setPlanActionStatus(ctx: Ctx, input: unknown): DisplayAction[] {
  const data = parseInput(actionSchema, input);
  const view = getMonthlyReportView(ctx, data.month);
  const item = view?.plan.find((p) => p.key === data.key);
  if (!view || !item) throw notFound("NO_ACTION", "Aksiyon bulunamadı.");
  ctx.db.transaction(() => setActionStatus(ctx.db, data.month, data.key, data.status, item.title, ctx.now().toISOString())).immediate();
  return getMonthlyReportView(ctx, data.month)!.plan;
}

// ------------------------------------------------------------------ e-posta

export async function emailMonthlyReport(ctx: Ctx, month: string): Promise<{ recipients: string[] }> {
  const view = getMonthlyReportView(ctx, month);
  if (!view) throw notFound("NO_REPORT", "Bu ay için rapor yok.");
  if (!isMailConfigured(ctx.db)) throw badRequest("MAIL_NOT_CONFIGURED", "E-posta gönderimi bağlı değil (Ayarlar → E-posta gönderimi).");
  const recipients = listActiveOwnerEmails(ctx.db);
  if (recipients.length === 0) throw badRequest("NO_RECIPIENTS", "E-posta adresi olan yönetici yok (Hesabım → e-posta).");
  const mail = buildMonthlyEmail(view);
  await sendMail(ctx.db, { to: recipients, subject: mail.subject, text: mail.text, html: mail.html });
  ctx.db.transaction(() => markMonthlyEmailed(ctx.db, month, ctx.now().toISOString())).immediate();
  return { recipients };
}

// ------------------------------------------------------------------ zamanlayıcı

const AI_RETRY_MS = 2 * 60 * 60_000;
const AI_MAX_ATTEMPTS = 4;

/**
 * Zamanlayıcı her dakika çağırır. Geçen ay bittiyse ve raporu yoksa (ya da ara rapor kaldıysa) son hâlini oluşturur;
 * yapay zekâ başarısız olduysa 2 saatte bir (en çok 4 kez) yeniden dener; bitince yöneticilere e-postayla gönderir.
 */
export async function runScheduledMonthlyReport(ctx: Ctx): Promise<{ month: string; status: string } | null> {
  const today = todayOf(ctx);
  const month = shiftMonth(today.slice(0, 7), -1);
  if (running.has(month)) return null;
  const from = `${month}-01`;
  if (getPeriodSummary(ctx.db, from, endOfMonth(from)).saleCount === 0) {
    ensureTargets(ctx, today.slice(0, 7));
    return null;
  }
  const ai = cloudAiActive(ctx.db);
  let row = getMonthlyReport(ctx.db, month);
  let status = "unchanged";
  if (!row || row.isPartial) {
    await withLock(month, async () => {
      computeAndStore(ctx, month);
      if (ai) await addCloudCommentary(ctx, month);
    });
    row = getMonthlyReport(ctx.db, month)!;
    status = "generated";
  } else if (ai && row.aiModel === LOCAL_AI_MODEL && row.aiAttempts < AI_MAX_ATTEMPTS && Date.now() - Date.parse(row.aiLastAttemptAt ?? "1970-01-01") >= AI_RETRY_MS) {
    await withLock(month, () => addCloudCommentary(ctx, month));
    row = getMonthlyReport(ctx.db, month)!;
    status = "ai_retried";
  }
  ensureTargets(ctx, today.slice(0, 7));
  const aiSettled = !ai || row.aiModel !== LOCAL_AI_MODEL || row.aiAttempts >= AI_MAX_ATTEMPTS;
  if (!row.emailedAt && aiSettled && isMailConfigured(ctx.db) && listActiveOwnerEmails(ctx.db).length > 0) {
    try {
      await emailMonthlyReport(ctx, month);
      status = "emailed";
    } catch (e) {
      console.error("[aylık rapor e-postası]", e instanceof Error ? e.message : e);
    }
  }
  return { month, status };
}

// ------------------------------------------------------------------ ekran verisi

export interface AssistantPageData {
  today: string;
  currentMonth: string;
  selectedMonth: string;
  months: { month: string; label: string; isPartial: boolean; hasAi: boolean }[];
  /** Seçilebilecek ama raporu olmayan aylar (satış olan) */
  report: MonthlyReportView | null;
  generating: boolean;
  ai: AiStatus;
  mailReady: boolean;
  current: { month: string; label: string; targets: ReturnType<typeof getTargetProgress>; rationale: Record<string, string | null>; sources: Record<string, string> };
}

export function getAssistantPageData(ctx: Ctx, month: string | null): AssistantPageData {
  const today = todayOf(ctx);
  const currentMonth = today.slice(0, 7);
  const list = listMonthlyReports(ctx.db);
  const lastDone = shiftMonth(currentMonth, -1);
  const selected = month && isMonth(month) && month <= currentMonth ? month : (list.find((r) => !r.isPartial)?.month ?? list[0]?.month ?? lastDone);
  const rows = ensureTargets(ctx, currentMonth);
  const months = new Map(list.map((r) => [r.month, { month: r.month, label: monthLabel(r.month), isPartial: r.isPartial, hasAi: r.hasAi }]));
  for (const m of [currentMonth, lastDone]) if (!months.has(m)) months.set(m, { month: m, label: monthLabel(m), isPartial: m === currentMonth, hasAi: false });
  return {
    today,
    currentMonth,
    selectedMonth: selected,
    months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    report: getMonthlyReportView(ctx, selected),
    generating: running.has(selected),
    ai: getAiStatus(ctx.db),
    mailReady: isMailConfigured(ctx.db) && listActiveOwnerEmails(ctx.db).length > 0,
    current: {
      month: currentMonth,
      label: monthLabel(currentMonth),
      targets: getTargetProgress(ctx, currentMonth, rows),
      rationale: Object.fromEntries(rows.map((r) => [r.metric, r.rationale])),
      sources: Object.fromEntries(rows.map((r) => [r.metric, r.source])),
    },
  };
}
