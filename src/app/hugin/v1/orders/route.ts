import { huginJson, huginOk, withHugin } from "@/server/okc/huginHttp";
import { huginListOrders } from "@/server/services/okc";

/** Hugin Cloud Link: yazar kasa açık siparişleri (fişi kesilmemiş satışları) listeler. */
export async function GET(req: Request) {
  return withHugin(req, "/orders", (ctx) => {
    const orders = huginListOrders(ctx);
    if (orders.length === 0) {
      return huginJson(204, null);
    }
    return huginOk({ orders }, req.headers.get("x-settings-hash") ? { settingsHashValue: req.headers.get("x-settings-hash") } : {});
  });
}
