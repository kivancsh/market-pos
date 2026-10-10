/**
 * Sunucuyla birlikte çalışan zamanlayıcı (src/instrumentation.ts başlatır): her dakika günlük rapor
 * e-postasının vakti gelmiş mi bakar. Gönderim başarısızsa (ör. internet yok) 30 dakika sonra tekrar dener.
 */
import { getDb } from "./db/connection";
import { runScheduledReports } from "./services/dailyReport";

const g = globalThis as unknown as { __marketKasaScheduler?: NodeJS.Timeout; __marketKasaReportBackoff?: number };
const RETRY_AFTER_MS = 30 * 60_000;

async function tick() {
  const now = Date.now();
  if ((g.__marketKasaReportBackoff ?? 0) > now) return;
  try {
    const results = await runScheduledReports({ db: getDb(), now: () => new Date() });
    if (results.some((r) => r.status === "failed")) g.__marketKasaReportBackoff = now + RETRY_AFTER_MS;
    for (const r of results) if (r.status === "sent") console.log(`[günlük rapor] gönderildi: ${r.recipients.join(", ")}`);
  } catch (e) {
    console.error("[zamanlayıcı]", e);
    g.__marketKasaReportBackoff = now + RETRY_AFTER_MS;
  }
}

export function startScheduler(): void {
  if (g.__marketKasaScheduler) return;
  g.__marketKasaScheduler = setInterval(() => void tick(), 60_000);
  g.__marketKasaScheduler.unref?.();
  setTimeout(() => void tick(), 15_000).unref?.();
}
