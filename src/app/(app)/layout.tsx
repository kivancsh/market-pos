import { requirePageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { getSettings } from "@/server/db/repositories/settings";
import { listActiveCashiersWithPins } from "@/server/db/repositories/users";
import { AppNav } from "@/client/components/AppNav";
import { isMailConfigured } from "@/server/mail";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();
  const db = getDb();
  const businessName = getSettings(db).businessName;
  const noCashier = user.role === "owner" && listActiveCashiersWithPins(db).length === 0;
  const noEmail = user.role === "owner" && !user.email;
  const noMail = user.role === "owner" && !isMailConfigured(db);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav role={user.role} userName={user.name} businessName={businessName} />
      {(noEmail || noMail) && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 print:hidden" data-testid="email-banner">
          {noMail ? (
            <>
              E-posta gönderimi ayarlanmamış: onay kodları ve günlük rapor gönderilemez.{" "}
              <a href="/ayarlar" className="underline">
                Ayarlar → E-posta gönderimi
              </a>
            </>
          ) : (
            <>
              Hesabınızda e-posta adresi yok: şifre değiştirme ve günlük rapor için gerekli.{" "}
              <a href="/yonetim/hesabim" className="underline">
                Yönetim Paneli → Hesabım
              </a>
            </>
          )}
        </div>
      )}
      {noCashier && (
        <div className="bg-sky-100 px-4 py-2 text-center text-sm font-medium text-sky-900 print:hidden">
          Henüz kasiyer hesabı yok. Kasiyerlerin Kasiyer No + PIN ile girebilmesi için{" "}
          <a href="/yonetim/kullanicilar" className="underline">
            Yönetim Paneli → Kullanıcılar
          </a>{" "}
          bölümünden kasiyer ekleyin.
        </div>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
