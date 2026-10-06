import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Giriş · Market Kasa" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const businessName = getSettings(getDb()).businessName;
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-100 p-4">
      <LoginForm next={next} businessName={businessName} />
    </main>
  );
}
