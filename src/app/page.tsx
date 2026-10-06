import { redirect } from "next/navigation";
import { requirePageRole } from "@/server/auth/pageSession";

export default async function Home() {
  await requirePageRole();
  // Panel (Aşama 6) gelene kadar herkes kasaya yönlenir.
  redirect("/kasa");
}
