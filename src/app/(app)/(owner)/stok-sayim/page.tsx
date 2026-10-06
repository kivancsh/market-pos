import { getClientSettings } from "@/server/pageData";
import { StockCountScreen } from "./StockCountScreen";

export const metadata = { title: "Stok sayımı · Market Kasa" };

export default async function StockCountPage(props: PageProps<"/stok-sayim">) {
  const sp = await props.searchParams;
  const pid = typeof sp.productId === "string" && /^\d+$/.test(sp.productId) ? Number(sp.productId) : null;
  return <StockCountScreen settings={getClientSettings()} initialProductId={pid} />;
}
