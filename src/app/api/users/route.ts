import { listUsers } from "@/server/db/repositories/users";
import { apiRoute, readJson } from "@/server/http/api";
import { createUser } from "@/server/services/users";

export const GET = apiRoute(["owner"], ({ ctx }) => ({ items: listUsers(ctx.db) }));
export const POST = apiRoute(["owner"], async ({ req, ctx }) => ({ user: createUser(ctx, (await readJson(req)) as never) }));
