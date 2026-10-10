import { requirePageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import { listActiveCashiersWithPins } from "@/server/db/repositories/users";
import { AppNav } from "@/client/components/AppNav";
import { getUpdateInfo } from "@/server/update";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();
  const db = getDb();
  const businessName = getSettings(db).businessName;
  const noCashier = user.role === "owner" && listActiveCashiersWithPins(db).length === 0;
  const update = user.role === "owner" ? getUpdateInfo() : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav role={user.role} userName={user.name} businessName={businessName} />
      {update?.available && update.latest && (
        <div className="bg-emerald-100 px-4 py-2 text-center text-sm font-medium text-emerald-900 print:hidden" data-testid="update-banner">
          Yeni sürüm var: {update.latest.version} (sizdeki {update.current}).{" "}
          <a href="/ayarlar#guncelleme" className="underline">
            Ayarlar → Program güncellemesi
          </a>
        </div>
      )}
      {noCashier && (
        <div className="bg-sky-100 px-4 py-2 text-center text-sm font-medium text-sky-900 print:hidden">
          Henüz kasiyer hesabı yok. Kasiyerlerin Kasiyer No + PIN ile girebilmesi için{" "}
          <a href="/yonetim/kullanicilar" className="underline">
            Yönetici Paneli → Kullanıcılar
          </a>{" "}
          bölümünden kasiyer ekleyin.
        </div>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
