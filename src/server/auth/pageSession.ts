import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/connection";
import type { Role } from "../db/repositories/sales";
import type { User } from "../db/repositories/users";
import { readSessionCookie, resolveSessionUser, SESSION_COOKIE } from "./session";

/** Sunucu sayfaları için: oturumdaki geçerli kullanıcı (yoksa null). */
export async function getPageUser(): Promise<User | null> {
  const store = await cookies();
  return resolveSessionUser(getDb(), await readSessionCookie(store.get(SESSION_COOKIE)?.value));
}

/** Sayfa için rol zorunluluğu: oturum yoksa /login'e, yetki yoksa /kasa'ya yönlendirir. */
export async function requirePageUser(...roles: Role[]): Promise<User> {
  const user = await getPageUser();
  if (!user) redirect("/login");
  if (roles.length > 0 && !roles.includes(user.role)) redirect("/kasa");
  return user;
}

/** Geriye uyumluluk: sadece rol. */
export async function requirePageRole(...roles: Role[]): Promise<Role> {
  return (await requirePageUser(...roles)).role;
}
