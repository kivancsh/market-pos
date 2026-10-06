import { requirePageRole } from "@/server/auth/pageSession";

/** Bu gruptaki tüm sayfalar sadece işletme sahibine açıktır (kasiyer /kasa'ya yönlenir). */
export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  await requirePageRole("owner");
  return children;
}
