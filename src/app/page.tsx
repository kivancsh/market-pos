import { redirect } from "next/navigation";
import { requirePageRole } from "@/server/auth/pageSession";

/** Giriş sonrası: yönetici Yönetici Paneli'ne, kasiyer kasaya. */
export default async function Home() {
  const role = await requirePageRole();
  redirect(role === "owner" ? "/yonetim" : "/kasa");
}
