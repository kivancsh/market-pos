import { apiRoute, readJson } from "@/server/http/api";
import { parseDateParam } from "@/server/services/dashboard";
import { reopenDay } from "@/server/services/dayClosing";

export const POST = apiRoute<{ date: string }>(["owner"], async ({ req, ctx, params }) => ({
  closing: reopenDay(ctx, parseDateParam(ctx, params.date), (await readJson(req)) as never),
}));
