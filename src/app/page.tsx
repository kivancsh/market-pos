import { redirect } from "next/navigation";
import { requirePageRole } from "@/server/auth/pageSession";

/** Giriş sonrası: yönetici panele, kasiyer kasaya. */
export default async function Home() {
  const role = await requirePageRole();
  redirect(role === "owner" ? "/panel" : "/kasa");
}
