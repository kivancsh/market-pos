import { apiRoute } from "@/server/http/api";
import { getCatalog } from "@/server/services/products";

/** Kasa kataloğu (maliyet içermez). */
export const GET = apiRoute(["owner", "cashier"], ({ ctx }) => ({
  items: getCatalog(ctx),
  generatedAt: ctx.now().toISOString(),
}));
