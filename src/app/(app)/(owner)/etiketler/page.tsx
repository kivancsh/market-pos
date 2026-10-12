import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import { LabelsScreen } from "./LabelsScreen";

export const metadata = { title: "Barkod etiketleri · Optiva" };

export default async function LabelsPage(props: PageProps<"/etiketler">) {
  const s = getSettings(getDb());
  const sp = await props.searchParams;
  const pid = typeof sp.productId === "string" && /^\d+$/.test(sp.productId) ? Number(sp.productId) : null;
  return <LabelsScreen defaultCols={s.labelCols} defaultRows={s.labelRows} initialProductId={pid} />;
}
