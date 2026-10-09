import { importTemplateXlsx, xlsxResponse } from "@/server/excel";
import { apiRoute } from "@/server/http/api";

export const GET = apiRoute(["owner"], async () => xlsxResponse(await importTemplateXlsx(), "urun-ice-aktarma-sablonu.xlsx"));
