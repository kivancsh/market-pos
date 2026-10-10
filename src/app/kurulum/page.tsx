import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/server/db/connection";
import { getMailStatus } from "@/server/mail";
import { hasOwner } from "@/server/services/users";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "Kurulum · Market Kasa" };

/** İlk açılış: yönetici hesabı oluşturma. Kurulum yapıldıysa girişe yönlenir. */
export default async function SetupPage() {
  await connection(); // her istekte DB'den oku (derlemede sabitlenmesin)
  const db = getDb();
  if (hasOwner({ db, now: () => new Date() })) redirect("/login");
  const mail = getMailStatus(db);
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-100 p-4">
      <SetupForm mailConfigured={mail.configured} mailUser={mail.user} />
    </main>
  );
}
