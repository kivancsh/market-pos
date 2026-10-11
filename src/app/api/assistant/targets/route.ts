import { apiRoute, readJson } from "@/server/http/api";
import { getTargetProgress, setTargets } from "@/server/services/assistant/targets";

/** Yönetici ayın hedeflerini değiştirir. */
export const PUT = apiRoute(["owner"], async ({ req, ctx }) => {
  const rows = setTargets(ctx, await readJson(req));
  return { targets: getTargetProgress(ctx, rows[0]!.month, rows) };
});
