import { apiRoute } from "@/server/http/api";
import { installMacUpdate } from "@/server/update";

/** Mac: indirilmiş güncellemeyi kurar (arka planda; program birkaç dakika kapanıp yeni sürümle açılır). */
export const POST = apiRoute(["owner"], ({ ctx }) => installMacUpdate(ctx));
