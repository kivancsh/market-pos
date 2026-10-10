import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import { getMailStatus } from "@/server/mail";
import { getUpdateInfo } from "@/server/update";
import { SettingsScreen } from "./SettingsScreen";

export const metadata = { title: "Ayarlar · Market Kasa" };

export default function SettingsPage() {
  const db = getDb();
  return <SettingsScreen initial={getSettings(db)} initialMail={getMailStatus(db)} initialUpdate={getUpdateInfo()} />;
}
