import { getClientSettings } from "@/server/pageData";
import { ProductsScreen } from "./ProductsScreen";

export const metadata = { title: "Ürünler · Market Kasa" };

export default function ProductsPage() {
  return <ProductsScreen settings={getClientSettings()} />;
}
