import { apiRoute, readJson } from "@/server/http/api";
import { createReturn } from "@/server/services/returns";

export const POST = apiRoute(["owner"], async ({ req, ctx }) => createReturn(ctx, (await readJson(req)) as never));
