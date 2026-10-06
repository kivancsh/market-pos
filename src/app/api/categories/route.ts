import { listCategories } from "@/server/db/repositories/categories";
import { apiRoute } from "@/server/http/api";

export const GET = apiRoute(["owner"], ({ ctx }) => ({ items: listCategories(ctx.db) }));
