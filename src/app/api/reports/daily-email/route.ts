import { badRequest } from "@/server/errors";
import { apiRoute, readJson } from "@/server/http/api";
import { parseDateParam } from "@/server/services/dashboard";
import { sendDailyReport } from "@/server/services/dailyReport";

/** Günlük raporu şimdi e-postayla gönder (Ayarlar → "Raporu şimdi gönder" / panel). */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const body = (await readJson(req).catch(() => ({}))) as { date?: string };
  const date = parseDateParam(ctx, body?.date ?? null);
  const r = await sendDailyReport(ctx, date, "manual");
  if (r.status === "failed") throw badRequest("REPORT_FAILED", r.message);
  if (r.status === "skipped") {
    throw badRequest(
      "REPORT_SKIPPED",
      r.reason === "not_configured"
        ? "E-posta gönderimi ayarlanmamış (Ayarlar → E-posta)."
        : r.reason === "no_recipients"
          ? "E-postası olan yönetici yok (Hesabım'dan e-posta ekleyin)."
          : "Rapor gönderilmedi.",
    );
  }
  return { ok: true, recipients: r.recipients, date };
});
