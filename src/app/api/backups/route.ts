import { apiRoute } from "@/server/http/api";
import { audit } from "@/server/services/audit";
import { createBackup, listBackups } from "@/server/services/backup";

export const GET = apiRoute(["owner"], () => ({ items: listBackups() }));

/** Elle yedek al. */
export const POST = apiRoute(["owner"], async ({ ctx }) => {
  const file = await createBackup(ctx.db, ctx.now());
  const name = file.split(/[\\/]/).pop();
  ctx.db.transaction(() => audit(ctx, "backup.create", `Elle yedek alındı: ${name}`)).immediate();
  return { file: name };
});
