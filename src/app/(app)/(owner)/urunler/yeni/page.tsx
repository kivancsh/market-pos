import { getClientSettings } from "@/server/pageData";
import { ProductCreateForm } from "./ProductCreateForm";

export const metadata = { title: "Yeni ürün · Optiva" };

export default function NewProductPage() {
  return <ProductCreateForm settings={getClientSettings()} />;
}
