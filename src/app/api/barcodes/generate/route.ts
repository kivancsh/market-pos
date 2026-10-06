import { apiRoute } from "@/server/http/api";
import { generateInternalBarcode } from "@/server/services/barcodes";

export const POST = apiRoute(["owner"], ({ ctx }) => ({ barcode: generateInternalBarcode(ctx) }));
