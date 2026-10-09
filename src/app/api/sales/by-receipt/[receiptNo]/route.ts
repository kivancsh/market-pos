import { getSaleByReceiptNo } from "@/server/db/repositories/sales";
import { notFound } from "@/server/errors";
import { apiRoute } from "@/server/http/api";

/** Fiş numarasıyla satış bul (iade ekranı). Boşluklar ve tire olmadan yazılmış numarayı da kabul eder. */
export const GET = apiRoute<{ receiptNo: string }>(["owner"], ({ ctx, params }) => {
  let no = decodeURIComponent(params.receiptNo).replace(/\s/g, "");
  if (/^\d{12}$/.test(no)) no = `${no.slice(0, 8)}-${no.slice(8)}`;
  const sale = getSaleByReceiptNo(ctx.db, no);
  if (!sale) throw notFound("SALE_NOT_FOUND", `${no} numaralı fiş bulunamadı.`);
  return { id: sale.id };
});
