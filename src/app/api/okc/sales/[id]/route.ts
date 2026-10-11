import { apiRoute, parseId } from "@/server/http/api";
import { getSaleOkcStatus } from "@/server/services/okc";

/** Satışın yazar kasa (yasal fiş) durumu; kasa ekranı fiş kesilene kadar sorar. */
export const GET = apiRoute<{ id: string }>(["owner", "cashier"], ({ ctx, params }) => ({ okc: getSaleOkcStatus(ctx, parseId(params.id)) }));
