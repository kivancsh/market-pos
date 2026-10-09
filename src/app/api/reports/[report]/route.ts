import { apiRoute } from "@/server/http/api";
import { buildReport, parseRange } from "@/server/services/reports";

export const GET = apiRoute<{ report: string }>(["owner"], ({ req, ctx, params }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = parseRange(ctx, sp.get("from"), sp.get("to"));
  return buildReport(ctx, params.report, from, to);
});
