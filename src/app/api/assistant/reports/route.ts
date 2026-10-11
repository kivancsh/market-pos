import { apiRoute, readJson } from "@/server/http/api";
import { generateMonthlyReport } from "@/server/services/assistant";

/** Ayın raporunu oluşturur / yeniler (yapay zekâ bağlıysa yorumla birlikte; birkaç dakika sürebilir). */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => ({ report: await generateMonthlyReport(ctx, await readJson(req)) }));
