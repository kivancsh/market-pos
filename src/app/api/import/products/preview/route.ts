import { apiRoute } from "@/server/http/api";
import { previewImport } from "@/server/services/productImport";
import { readUploadedRows } from "../_shared";

export const POST = apiRoute(["owner"], async ({ req, ctx }) => previewImport(ctx, await readUploadedRows(req)));
