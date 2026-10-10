/**
 * Microsoft kişisel hesapları (Outlook.com / Hotmail / Live / MSN) 2026'dan beri programların şifreyle (uygulama
 * şifresi dahil) e-posta göndermesine izin vermiyor; yalnızca OAuth2. Bu yüzden gönderen hesap olarak kabul edilmez.
 * Bu adresler yönetici e-postası (alıcı) olarak sorunsuz kullanılabilir. Sunucu ve ekranlar ortak kullanır.
 */
const MICROSOFT_PERSONAL = /@(hotmail|outlook|live|msn)\.[a-z.]+$/i;

export const MICROSOFT_UNSUPPORTED =
  "Microsoft (Outlook / Hotmail) artık programların şifreyle e-posta göndermesine izin vermiyor. Gönderen hesap olarak bir Gmail hesabı kullanın " +
  "(dükkân için yeni bir Gmail açabilirsiniz). Onay kodları ve günlük rapor yine Hotmail adresinize gelebilir: yönetici bilgilerinde e-posta olarak onu yazın.";

export function isMicrosoftPersonal(address: string): boolean {
  return MICROSOFT_PERSONAL.test(address.trim());
}
