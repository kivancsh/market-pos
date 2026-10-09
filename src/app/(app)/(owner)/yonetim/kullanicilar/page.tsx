import { requirePageUser } from "@/server/auth/pageSession";
import { UsersScreen } from "./UsersScreen";

export const metadata = { title: "Kullanıcılar · Market Kasa" };

export default async function UsersPage() {
  const me = await requirePageUser("owner");
  return <UsersScreen meId={me.id} />;
}
