import { apiRoute, readJson } from "@/server/http/api";
import { createCategory, listCategoriesForAdmin } from "@/server/services/categories";

export const GET = apiRoute(["owner"], ({ ctx }) => ({ items: listCategoriesForAdmin(ctx) }));
export const POST = apiRoute(["owner"], async ({ req, ctx }) => ({ category: createCategory(ctx, (await readJson(req)) as never) }));
