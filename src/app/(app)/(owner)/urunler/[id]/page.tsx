import { notFound } from "next/navigation";
import { getClientSettings } from "@/server/pageData";
import { ProductDetail } from "./ProductDetail";

export const metadata = { title: "Ürün · Market Kasa" };

export default async function ProductPage(props: PageProps<"/urunler/[id]">) {
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();
  const sp = await props.searchParams;
  return <ProductDetail id={Number(id)} isNew={sp.yeni === "1"} settings={getClientSettings()} />;
}
