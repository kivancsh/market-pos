import { apiRoute, readJson } from "@/server/http/api";
import { createBackup } from "@/server/services/backup";
import { sendDailyReport } from "@/server/services/dailyReport";
import { closeDay } from "@/server/services/dayClosing";

/**
 * Günü kapatır; ardından otomatik veritabanı yedeği alınır ve günlük rapor yöneticilere e-postayla gider.
 * Yedek ya da e-posta hatası kapanışı geri almaz; sonuç ekranda gösterilir.
 */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const closing = closeDay(ctx, (await readJson(req)) as never);
  let backup: { ok: true; file: string | undefined } | { ok: false; error: string };
  try {
    const file = await createBackup(ctx.db, ctx.now());
    backup = { ok: true, file: file.split(/[\\/]/).pop() };
  } catch (e) {
    console.error("[backup] gün sonu yedeği alınamadı:", e);
    backup = { ok: false, error: "Gün kapatıldı ama yedek alınamadı. Ayarlar ekranından elle yedek alın." };
  }
  const report = await sendDailyReport(ctx, closing.businessDate, "close");
  return { closing, backup, report };
});
