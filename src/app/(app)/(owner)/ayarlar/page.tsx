import { usesDefaultPins } from "@/server/auth/pins";
import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import { SettingsScreen } from "./SettingsScreen";

export const metadata = { title: "Ayarlar · Market Kasa" };

export default function SettingsPage() {
  return <SettingsScreen initial={getSettings(getDb())} defaultPins={usesDefaultPins()} />;
}
