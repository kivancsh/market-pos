import { apiRoute, parseId, readJson } from "@/server/http/api";
import { simulateSaleOkc } from "@/server/services/okc";

/** Yazar kasa simülatörü: ödemeyi "cihazda" alır ya da hata verdirir (yalnız Deneme modunda). */
export const POST = apiRoute<{ id: string }>(["owner", "cashier"], async ({ req, ctx, params }) => ({
  okc: simulateSaleOkc(ctx, parseId(params.id), (await readJson(req)) as never),
}));
