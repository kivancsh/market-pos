import { apiRoute, parseId } from "@/server/http/api";
import { cancelSaleOkc } from "@/server/services/okc";

/** Yazar kasa fişi kesmediyse satışı iptal eder (stok geri eklenir). */
export const POST = apiRoute<{ id: string }>(["owner", "cashier"], ({ ctx, params }) => ({ okc: cancelSaleOkc(ctx, parseId(params.id)) }));
