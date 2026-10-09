import { apiRoute } from "@/server/http/api";
import { getDashboard, parseDateParam } from "@/server/services/dashboard";

export const GET = apiRoute(["owner"], ({ req, ctx }) =>
  getDashboard(ctx, parseDateParam(ctx, new URL(req.url).searchParams.get("date"))),
);
