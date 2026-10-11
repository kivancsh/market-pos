import { apiRoute } from "@/server/http/api";
import { retryAi } from "@/server/services/assistant";
import { assertMonth } from "@/server/services/assistant/targets";

/** Kayıtlı rapora yapay zekâ yorumunu yeniden ister. */
export const POST = apiRoute<{ month: string }>(["owner"], async ({ params, ctx }) => ({ report: await retryAi(ctx, assertMonth(params.month)) }));
