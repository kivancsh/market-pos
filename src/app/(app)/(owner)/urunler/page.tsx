import { getClientSettings } from "@/server/pageData";
import { ProductsScreen } from "./ProductsScreen";

export const metadata = { title: "Ürünler · Market Kasa" };

export default async function ProductsPage({ searchParams }: PageProps<"/urunler">) {
  const { kategori } = await searchParams;
  return <ProductsScreen settings={getClientSettings()} initialCategory={typeof kategori === "string" && kategori ? kategori : "all"} />;
}
