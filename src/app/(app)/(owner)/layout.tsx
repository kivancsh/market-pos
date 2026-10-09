import { requirePageRole } from "@/server/auth/pageSession";
import { AdminBreadcrumb } from "@/client/components/AdminBreadcrumb";

/** Bu gruptaki tüm sayfalar sadece yöneticiye açıktır (kasiyer /kasa'ya yönlenir). */
export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  await requirePageRole("owner");
  return (
    <>
      <AdminBreadcrumb />
      {children}
    </>
  );
}
