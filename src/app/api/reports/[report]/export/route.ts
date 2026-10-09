import { getSettings } from "@/server/db/repositories/settings";
import { asciiSlug, reportToXlsx, xlsxResponse } from "@/server/excel";
import { apiRoute } from "@/server/http/api";
import { buildReport, parseRange } from "@/server/services/reports";

/** Raporu Excel (.xlsx) olarak indirir. */
export const GET = apiRoute<{ report: string }>(["owner"], async ({ req, ctx, params }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = parseRange(ctx, sp.get("from"), sp.get("to"));
  const report = buildReport(ctx, params.report, from, to);
  const buf = await reportToXlsx(report, getSettings(ctx.db).businessName);
  const range = report.usesRange ? `${from}_${to}` : to;
  return xlsxResponse(buf, `rapor-${asciiSlug(report.title)}-${range}.xlsx`);
});
