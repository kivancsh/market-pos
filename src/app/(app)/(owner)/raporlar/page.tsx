import { isReportKey } from "@/server/services/reports";
import { ReportsScreen } from "./ReportsScreen";

export const metadata = { title: "Raporlar · Market Kasa" };

export default async function ReportsPage(props: PageProps<"/raporlar">) {
  const sp = await props.searchParams;
  const tab = typeof sp.rapor === "string" && isReportKey(sp.rapor) ? sp.rapor : "daily";
  return <ReportsScreen key={tab} initialTab={tab} />;
}
