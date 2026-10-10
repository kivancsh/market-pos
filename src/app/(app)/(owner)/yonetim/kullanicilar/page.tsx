import { requirePageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { secretChangeNeedsCode } from "@/server/services/users";
import { UsersScreen } from "./UsersScreen";

export const metadata = { title: "Kullanıcılar · Market Kasa" };

export default async function UsersPage() {
  const me = await requirePageUser("owner");
  return <UsersScreen meId={me.id} codeRequired={secretChangeNeedsCode({ db: getDb(), now: () => new Date() }, me)} />;
}
