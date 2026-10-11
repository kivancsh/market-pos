import { huginError, huginOk, withHugin } from "@/server/okc/huginHttp";
import { huginGetOrder } from "@/server/services/okc";

/** Hugin Cloud Link: sipariş (satış) ayrıntısı — yazar kasa fişi bu kalemlerle açar. */
export async function GET(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return withHugin(req, `/orders/${orderId}`, (ctx) => {
    const detail = huginGetOrder(ctx, orderId);
    if (!detail) return huginError(404, "ERR_NO_ORDER", "Sipariş yok", "Sipariş numarasına ait açık sipariş bulunamadı.", `/orders/${orderId}`);
    return huginOk(detail);
  });
}
