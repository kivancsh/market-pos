import { apiRoute, parseId, readJson } from "@/server/http/api";
import { updateUser } from "@/server/services/users";

export const PATCH = apiRoute<{ id: string }>(["owner"], async ({ req, ctx, params }) => ({
  user: updateUser(ctx, parseId(params.id), (await readJson(req)) as never),
}));
