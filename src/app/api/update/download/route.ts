import { apiRoute } from "@/server/http/api";
import { downloadUpdate, getUpdateInfo } from "@/server/update";

/** Önce yedek alır, yeni kurulum dosyasını indirip doğrular. Kurulumu Optiva penceresi başlatır. */
export const POST = apiRoute(["owner"], async ({ ctx }) => ({ ...(await downloadUpdate(ctx)), update: getUpdateInfo() }));
