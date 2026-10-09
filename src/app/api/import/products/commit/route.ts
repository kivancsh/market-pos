import { apiRoute } from "@/server/http/api";
import { commitImport } from "@/server/services/productImport";
import { readUploadedRows } from "../_shared";

/** Aynı dosya yeniden doğrulanır; sadece hatasız satırlar tek transaction'da eklenir. */
export const POST = apiRoute(["owner"], async ({ req, ctx }) => commitImport(ctx, await readUploadedRows(req)));
