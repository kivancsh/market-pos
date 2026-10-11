import { apiRoute } from "@/server/http/api";
import { emailMonthlyReport } from "@/server/services/assistant";
import { assertMonth } from "@/server/services/assistant/targets";

/** Raporu yöneticilerin e-postasına gönderir. */
export const POST = apiRoute<{ month: string }>(["owner"], async ({ params, ctx }) => emailMonthlyReport(ctx, assertMonth(params.month)));
