import { apiRoute } from "@/server/http/api";
import { createBackup, listBackups } from "@/server/services/backup";

export const GET = apiRoute(["owner"], () => ({ items: listBackups() }));

/** Elle yedek al. */
export const POST = apiRoute(["owner"], async ({ ctx }) => {
  const file = await createBackup(ctx.db, ctx.now());
  return { file: file.split(/[\\/]/).pop() };
});
