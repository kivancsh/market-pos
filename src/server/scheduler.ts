/**
 * Sunucuyla birlikte çalışan zamanlayıcı (src/instrumentation.ts başlatır):
 * - Her dakika günlük rapor e-postasının vakti gelmiş mi bakar. Gönderim başarısızsa (ör. internet yok) 30 dakika sonra tekrar dener.
 * - Açılıştan kısa süre sonra ve 6 saatte bir program güncellemesi var mı bakar (internet yoksa 1 saat sonra tekrar).
 */
import { getDb } from "./db/connection";
import { runScheduledReports } from "./services/dailyReport";
import { checkForUpdate, cleanupUpdates, updatesEnabled } from "./update";

const g = globalThis as unknown as {
  __marketKasaScheduler?: NodeJS.Timeout;
  __marketKasaReportBackoff?: number;
  __marketKasaNextUpdateCheck?: number;
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

async function tick() {
  const now = Date.now();
  await reportTick(now);
  await updateTick(now).catch((e) => console.error("[güncelleme]", e));
}

export function startScheduler(): void {
  if (g.__marketKasaScheduler) return;
  cleanupUpdates();
  g.__marketKasaScheduler = setInterval(() => void tick(), 60_000);
  g.__marketKasaScheduler.unref?.();
  setTimeout(() => void tick(), 15_000).unref?.();
}
