import { huginError, huginOk, readBody, withHugin } from "@/server/okc/huginHttp";
import { huginOrderResult } from "@/server/services/okc";

/** Hugin Cloud Link: yazar kasa siparişin sonucunu (çoğunlukla hata) bildirir. */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const instance = `/orders/${orderId}/result`;
  return withHugin(req, instance, async (ctx) => {
    const body = await readBody(req);
    if (!body) return huginError(400, "ERR_BAD_REQUEST", "Geçersiz istek", "Gövde okunamadı.", instance);
    if (!huginOrderResult(ctx, orderId, body)) return huginError(404, "ERR_NO_ORDER", "Sipariş yok", "Sipariş bulunamadı.", instance);
    return huginOk();
  });
}
