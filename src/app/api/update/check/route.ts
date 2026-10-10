import { apiRoute } from "@/server/http/api";
import { checkForUpdate } from "@/server/update";

/** "Güncellemeleri denetle": GitHub'daki en son sürüm bilgisini hemen okur. */
export const POST = apiRoute(["owner"], async ({ ctx }) => ({ update: await checkForUpdate(ctx.now()) }));
