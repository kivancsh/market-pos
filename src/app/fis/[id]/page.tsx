import { notFound } from "next/navigation";
import { formatIstanbulTime, getBusinessDate } from "@/lib/businessDate";
import { formatTRY } from "@/lib/money";
import { requirePageRole } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { getSaleById, getSaleItems } from "@/server/db/repositories/sales";
import { getSettings } from "@/server/db/repositories/settings";
import { PrintOnLoad } from "./PrintOnLoad";

export const metadata = { title: "Bilgi fişi" };

/** 80 mm termal yazıcıya uygun bilgi fişi. Maliyet/kâr içermez. */
export default async function ReceiptPage(props: PageProps<"/fis/[id]">) {
  const role = await requirePageRole();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const db = getDb();
  const sale = /^\d+$/.test(id) ? getSaleById(db, Number(id)) : undefined;
  if (!sale) notFound();
  // Kasiyer sadece bugünün fişlerini görebilir.
  if (role === "cashier" && sale.businessDate !== getBusinessDate()) notFound();
  const items = getSaleItems(db, sale.id);
  const { businessName } = getSettings(db);
  const created = new Date(sale.createdAt);
  const [y, m, d] = sale.businessDate.split("-");

  return (
    <main className="receipt mx-auto w-[72mm] bg-white p-2 font-mono text-[12px] leading-tight text-black">
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print { body { background: white; } .no-print { display: none; } }
      `}</style>
      <div className="text-center">
        <div className="text-[15px] font-bold">{businessName}</div>
        <div>BİLGİ FİŞİ</div>
        <div>
          {d}.{m}.{y} {formatIstanbulTime(created)}
        </div>
        <div>Fiş no: {sale.receiptNo}</div>
        {sale.status === "voided" && <div className="mt-1 font-bold">*** İPTAL EDİLDİ ***</div>}
      </div>
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="align-top">
              <td className="pb-1">
                {i.productNameSnapshot}
                <br />
                {i.qty} x {formatTRY(i.unitPriceKurus)}
              </td>
              <td className="pb-1 text-right whitespace-nowrap">{formatTRY(i.unitPriceKurus * i.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <div className="flex justify-between">
        <span>Ara toplam</span>
        <span>{formatTRY(sale.subtotalKurus)}</span>
      </div>
      {sale.discountKurus > 0 && (
        <div className="flex justify-between">
          <span>İndirim</span>
          <span>-{formatTRY(sale.discountKurus)}</span>
        </div>
      )}
      <div className="flex justify-between text-[15px] font-bold">
        <span>TOPLAM</span>
        <span>{formatTRY(sale.totalKurus)}</span>
      </div>
      <div className="flex justify-between">
        <span>KDV dahildir</span>
        <span>{formatTRY(sale.vatTotalKurus)}</span>
      </div>
      <div className="mt-1 flex justify-between">
        <span>Ödeme</span>
        <span>{sale.paymentMethod === "cash" ? "Nakit" : "Kart"}</span>
      </div>
      {sale.paymentMethod === "cash" && sale.cashReceivedKurus !== null && (
        <>
          <div className="flex justify-between">
            <span>Alınan</span>
            <span>{formatTRY(sale.cashReceivedKurus)}</span>
          </div>
          <div className="flex justify-between">
            <span>Para üstü</span>
            <span>{formatTRY(sale.changeKurus ?? 0)}</span>
          </div>
        </>
      )}
      <hr className="my-2 border-dashed border-black" />
      <div className="text-center font-bold">Bilgi fişidir, mali değeri yoktur.</div>
      <div className="mt-1 text-center">Teşekkür ederiz</div>
      <PrintOnLoad enabled={sp.print === "1"} />
    </main>
  );
}
