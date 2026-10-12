import { apiRoute, readJson } from "@/server/http/api";
import { getAiStatus, saveAiSettings } from "@/server/services/assistant/ai";

/** Asistan durumu: bulut yapay zekâ bu kurulumda var mı, açık mı. */
export const GET = apiRoute(["owner"], ({ ctx }) => getAiStatus(ctx.db));

/** Bulut yapay zekâyı aç/kapat. */
export const PUT = apiRoute(["owner"], async ({ req, ctx }) => saveAiSettings(ctx, await readJson(req)));
