import { NextResponse, type NextRequest } from "next/server";
import { readRoleFromCookie, SESSION_COOKIE } from "@/server/auth/session";

/** Sadece işletme sahibinin açabileceği sayfalar. */
export const OWNER_ONLY_PREFIXES = [
  "/panel",
  "/urunler",
  "/etiketler",
  "/mal-girisi",
  "/stok-sayim",
  "/raporlar",
  "/ayarlar",
  "/iade",
  "/simulator",
  "/yonetim",
];

/** Oturumsuz açılabilen sayfalar (kendi içlerinde veritabanından kontrol yaparlar). */
const PUBLIC_PATHS = ["/login", "/kurulum"];

/**
 * Sayfa istekleri için ön kontrol (asıl kontrol her sayfada ve her API ucunda sunucuda tekrar yapılır):
 * oturum yoksa /login'e, kasiyer yönetici sayfasına girmeye çalışırsa /kasa'ya yönlendirir.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const role = await readRoleFromCookie(request.cookies.get(SESSION_COOKIE)?.value);

  // Giriş/kurulum sayfaları her zaman açılır; "zaten girişli mi" kararını sayfa veritabanına bakarak verir
  // (çerezdeki rol eski olabilir: şifre değişmiş / hesap pasife alınmış olabilir → döngü olmasın).
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (!role) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (role === "cashier" && OWNER_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.redirect(new URL("/kasa", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
