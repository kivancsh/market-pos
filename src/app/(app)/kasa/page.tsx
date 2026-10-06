import { requirePageRole } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import type { KasaSettings } from "@/client/types";
import { KasaScreen } from "./KasaScreen";

export const metadata = { title: "Kasa · Market Kasa" };

export default async function KasaPage(props: PageProps<"/kasa">) {
  const role = await requirePageRole();
  const sp = await props.searchParams;
  const s = getSettings(getDb());
  const settings: KasaSettings = {
    businessName: s.businessName,
    cashierCanDiscount: s.cashierCanDiscount,
    scannerMaxIntervalMs: s.scannerMaxIntervalMs,
    scannerMinLength: s.scannerMinLength,
    scannerDupWindowMs: s.scannerDupWindowMs,
    soundEnabled: s.soundEnabled,
  };
  return <KasaScreen role={role} settings={settings} simulator={role === "owner" && sp.sim === "1"} />;
}
