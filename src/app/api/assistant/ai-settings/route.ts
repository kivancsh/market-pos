import { apiRoute, readJson } from "@/server/http/api";
import { getAiStatus, saveAiSettings } from "@/server/services/assistant/ai";

/** Yapay zekâ bağlantı durumu (anahtarın kendisi asla dönmez). */
export const GET = apiRoute(["owner"], ({ ctx }) => getAiStatus(ctx.db));

/** Anahtar gir / kaldır / yorumu aç-kapat. */
export const PUT = apiRoute(["owner"], async ({ req, ctx }) => saveAiSettings(ctx, await readJson(req)));
