import { apiRoute } from "@/server/http/api";
import { getUpdateInfo } from "@/server/update";

/** Çalışan sürüm ve (varsa) yeni sürüm bilgisi. */
export const GET = apiRoute(["owner"], () => ({ update: getUpdateInfo() }));
