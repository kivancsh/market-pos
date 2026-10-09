import { apiRoute } from "@/server/http/api";
import { parseDateParam } from "@/server/services/dashboard";
import { getDayClosingView } from "@/server/services/dayClosing";

export const GET = apiRoute<{ date: string }>(["owner"], ({ ctx, params }) => getDayClosingView(ctx, parseDateParam(ctx, params.date)));
