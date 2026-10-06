import { requirePageRole } from "@/server/auth/pageSession";
import { usesDefaultPins } from "@/server/auth/pins";
import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import { AppNav } from "@/client/components/AppNav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const role = await requirePageRole();
  const businessName = getSettings(getDb()).businessName;
  const defaultPins = role === "owner" && usesDefaultPins();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav role={role} businessName={businessName} />
      {defaultPins && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 print:hidden">
          Varsayılan PIN&apos;ler kullanılıyor. Güvenlik için .env dosyasından OWNER_PIN ve CASHIER_PIN&apos;i değiştirin.
        </div>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
