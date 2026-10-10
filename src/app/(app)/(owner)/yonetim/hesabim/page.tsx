import { requirePageUser } from "@/server/auth/pageSession";
import { AccountScreen } from "./AccountScreen";

export const metadata = { title: "Hesabım · Market Kasa" };

export default async function AccountPage() {
  const me = await requirePageUser("owner");
  return <AccountScreen id={me.id} initialName={me.name} initialUsername={me.username ?? ""} initialEmail={me.email} />;
}
