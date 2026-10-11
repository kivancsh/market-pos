import { huginError, huginOk, readBody, withHugin } from "@/server/okc/huginHttp";
import { huginSale } from "@/server/services/okc";

/** Hugin Cloud Link: yazar kasa tamamlanan satışı (kesilen mali fişi) bildirir. */
export async function POST(req: Request) {
  return withHugin(req, "/sales", async (ctx) => {
    const body = await readBody(req);
    if (!body) return huginError(400, "ERR_BAD_REQUEST", "Geçersiz istek", "Gövde okunamadı.", "/sales");
    const r = huginSale(ctx, body);
    return huginOk({ confirmationCode: r.confirmationCode });
  });
}
