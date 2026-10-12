import { getClientSettings } from "@/server/pageData";
import { PurchaseScreen } from "./PurchaseScreen";

export const metadata = { title: "Mal girişi · Optiva" };

export default async function PurchasePage(props: PageProps<"/mal-girisi">) {
  const sp = await props.searchParams;
  const pid = typeof sp.productId === "string" && /^\d+$/.test(sp.productId) ? Number(sp.productId) : null;
  return <PurchaseScreen settings={getClientSettings()} initialProductId={pid} />;
}
