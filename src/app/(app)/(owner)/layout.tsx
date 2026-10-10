import { Suspense } from "react";
import { requirePageRole } from "@/server/auth/pageSession";
import { OwnerMobileMenu, OwnerSidebar } from "@/client/components/OwnerSidebar";

/**
 * Yönetici Paneli: bu gruptaki tüm sayfalar sadece yöneticiye açıktır (kasiyer /kasa'ya yönlenir).
 * Solda yönetici menüsü (dar ekranda üstte açılır menü).
 */
export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  await requirePageRole("owner");
  return (
    <div className="flex flex-1">
      <Suspense>
        <OwnerSidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense>
          <OwnerMobileMenu />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
