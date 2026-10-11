/**
 * Sunucuyla birlikte çalışan zamanlayıcı (src/instrumentation.ts başlatır):
 * - Her dakika günlük rapor e-postasının vakti gelmiş mi bakar. Gönderim başarısızsa (ör. internet yok) 30 dakika sonra tekrar dener.
 * - Açılıştan kısa süre sonra ve 6 saatte bir program güncellemesi var mı bakar (internet yoksa 1 saat sonra tekrar).
 * - 5 dakikada bir aylık raporu denetler: ay bittiyse yapay zekâ asistanının raporunu oluşturur ve e-postayla gönderir
 *   (yapay zekâ birkaç dakika sürebilir; diğer işleri bekletmez).
 */
import { getDb } from "./db/connection";
import { runScheduledMonthlyReport } from "./services/assistant";
import { runScheduledReports } from "./services/dailyReport";
import { checkForUpdate, cleanupUpdates, updatesEnabled } from "./update";

const g = globalThis as unknown as {
  __marketKasaScheduler?: NodeJS.Timeout;
  __marketKasaReportBackoff?: number;
  __marketKasaNextUpdateCheck?: number;
  __marketKasaNextMonthlyCheck?: number;
  __marketKasaMonthlyRunning?: boolean;
};
const RETRY_AFTER_MS = 30 * 60_000;
const UPDATE_EVERY_MS = 6 * 60 * 60_000;
const UPDATE_RETRY_MS = 60 * 60_000;

async function reportTick(now: number) {
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

async function updateTick(now: number) {
  if (!updatesEnabled() || (g.__marketKasaNextUpdateCheck ?? 0) > now) return;
  g.__marketKasaNextUpdateCheck = now + UPDATE_EVERY_MS;
  const info = await checkForUpdate();
  if (info.error) g.__marketKasaNextUpdateCheck = now + UPDATE_RETRY_MS;
  else if (info.available) console.log(`[güncelleme] yeni sürüm var: ${info.latest?.version} (çalışan ${info.current})`);
}

const MONTHLY_EVERY_MS = 5 * 60_000;

function monthlyTick(now: number) {
  if (g.__marketKasaMonthlyRunning || (g.__marketKasaNextMonthlyCheck ?? 0) > now) return;
  g.__marketKasaNextMonthlyCheck = now + MONTHLY_EVERY_MS;
  g.__marketKasaMonthlyRunning = true;
  runScheduledMonthlyReport({ db: getDb(), now: () => new Date() })
    .then((r) => {
      if (r && r.status !== "unchanged") console.log(`[aylık rapor] ${r.month}: ${r.status}`);
    })
    .catch((e) => console.error("[aylık rapor]", e))
    .finally(() => (g.__marketKasaMonthlyRunning = false));
}

async function tick() {
  const now = Date.now();
  await reportTick(now);
  monthlyTick(now);
  await updateTick(now).catch((e) => console.error("[güncelleme]", e));
}

export function startScheduler(): void {
  if (g.__marketKasaScheduler) return;
  cleanupUpdates();
  g.__marketKasaScheduler = setInterval(() => void tick(), 60_000);
  g.__marketKasaScheduler.unref?.();
  setTimeout(() => void tick(), 15_000).unref?.();
}
