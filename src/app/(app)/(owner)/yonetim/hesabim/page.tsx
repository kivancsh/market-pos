import { requirePageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { isMailConfigured } from "@/server/mail";
import { secretChangeNeedsCode } from "@/server/services/users";
import { AccountScreen } from "./AccountScreen";

export const metadata = { title: "Hesabım · Optiva" };

export default async function AccountPage() {
  const me = await requirePageUser("owner");
  const db = getDb();
  return (
    <AccountScreen
      id={me.id}
      initialName={me.name}
      initialUsername={me.username ?? ""}
      initialEmail={me.email}
      mailConfigured={isMailConfigured(db)}
      codeRequired={secretChangeNeedsCode({ db, now: () => new Date() }, me)}
    />
  );
}
