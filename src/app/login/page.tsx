import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getPageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import { listActiveOwnerEmails } from "@/server/db/repositories/users";
import { isMailConfigured } from "@/server/mail";
import { hasOwner } from "@/server/services/users";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Giriş · Market Kasa" };

export default async function LoginPage(props: PageProps<"/login">) {
  await connection(); // her istekte DB'den oku (derlemede sabitlenmesin)
  const db = getDb();
  if (!hasOwner({ db, now: () => new Date() })) redirect("/kurulum");
  if (await getPageUser()) redirect("/");
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const mode = sp.mode === "owner" ? "owner" : "cashier";
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-100 p-4">
      <LoginForm next={next} businessName={getSettings(db).businessName} initialMode={mode} forgotByEmail={isMailConfigured(db) && listActiveOwnerEmails(db).length > 0} />
    </main>
  );
}
