import { apiRoute, readJson } from "@/server/http/api";
import { createBackup } from "@/server/services/backup";
import { closeDay } from "@/server/services/dayClosing";

/** Günü kapatır; ardından otomatik veritabanı yedeği alınır (yedek hatası kapanışı geri almaz). */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const closing = closeDay(ctx, (await readJson(req)) as never);
  try {
    const file = await createBackup(ctx.db, ctx.now());
    return { closing, backup: { ok: true, file: file.split(/[\\/]/).pop() } };
  } catch (e) {
    console.error("[backup] gün sonu yedeği alınamadı:", e);
    return { closing, backup: { ok: false, error: "Gün kapatıldı ama yedek alınamadı. Ayarlar ekranından elle yedek alın." } };
  }
});
