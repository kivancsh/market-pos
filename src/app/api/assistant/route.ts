import { apiRoute } from "@/server/http/api";
import { getAssistantPageData } from "@/server/services/assistant";

/** Yapay zekâ asistanı ekran verisi: seçili ayın raporu, bu ayın hedef gidişatı, bağlantı durumu. */
export const GET = apiRoute(["owner"], ({ req, ctx }) => getAssistantPageData(ctx, new URL(req.url).searchParams.get("month")));
