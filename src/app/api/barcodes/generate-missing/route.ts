import { apiRoute } from "@/server/http/api";
import { generateMissingBarcodes } from "@/server/services/barcodes";

export const POST = apiRoute(["owner"], ({ ctx }) => ({ generated: generateMissingBarcodes(ctx) }));
