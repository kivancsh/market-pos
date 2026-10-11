import { apiRoute, parseId } from "@/server/http/api";
import { retrySaleOkc } from "@/server/services/okc";

/** Hata veren fişi yazar kasaya yeniden gönderir. */
export const POST = apiRoute<{ id: string }>(["owner", "cashier"], ({ ctx, params }) => ({ okc: retrySaleOkc(ctx, parseId(params.id)) }));
