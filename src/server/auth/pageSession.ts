import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "../db/repositories/sales";
import { readRoleFromCookie, SESSION_COOKIE } from "./session";

/** Sunucu sayfaları için: oturumdaki rol (yoksa null). */
export async function getPageRole(): Promise<Role | null> {
  const store = await cookies();
  return readRoleFromCookie(store.get(SESSION_COOKIE)?.value);
}

/** Sayfa için rol zorunluluğu: oturum yoksa /login'e, yetki yoksa /kasa'ya yönlendirir. */
export async function requirePageRole(...roles: Role[]): Promise<Role> {
  const role = await getPageRole();
  if (!role) redirect("/login");
  if (roles.length > 0 && !roles.includes(role)) redirect("/kasa");
  return role;
}
