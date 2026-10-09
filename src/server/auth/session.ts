import { getIronSession, unsealData, webCookies, type IronSession, type SessionOptions } from "iron-session";
import type { DB } from "../db/types";
import type { Role } from "../db/repositories/sales";
import { getUserById, type User } from "../db/repositories/users";
import { getSessionSecret } from "./secret";

export interface SessionData {
  userId: number;
  role: Role;
  name: string;
  /** Kullanıcının session_version'ı; şifre/PIN değişince veya pasife alınınca eski oturumlar geçersiz olur. */
  sv: number;
  loginAt: string;
}

export const SESSION_COOKIE = "mp_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function sessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: getSessionSecret(),
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      // Dükkân içi ağ http ile çalışır; https arkasında COOKIE_SECURE=true yapılabilir.
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
    },
  };
}

/** API uçları için: oturumu doğrudan istekten okur; yazılan çerez `resHeaders`'a eklenir. */
export function getRequestSession(req: Request, resHeaders: Headers): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(webCookies(req, resHeaders), sessionOptions());
}

/** Ham çerez değerini çözer (proxy ve sayfalar için). Geçersizse null. */
export async function readSessionCookie(value: string | undefined): Promise<Partial<SessionData> | null> {
  if (!value) return null;
  try {
    return await unsealData<Partial<SessionData>>(value, { password: getSessionSecret(), ttl: SESSION_TTL_SECONDS });
  } catch {
    return null;
  }
}

/** Proxy için hızlı kontrol (veritabanına bakmaz; asıl kontrol sayfada/API'de yapılır). */
export async function readRoleFromCookie(value: string | undefined): Promise<Role | null> {
  const d = await readSessionCookie(value);
  return d && (d.role === "owner" || d.role === "cashier") && typeof d.userId === "number" ? d.role : null;
}

/** Oturumdaki kullanıcı hâlâ geçerli mi? (var, aktif, rolü ve oturum sürümü aynı) */
export function resolveSessionUser(db: DB, d: Partial<SessionData> | null | undefined): User | null {
  if (!d || typeof d.userId !== "number") return null;
  const u = getUserById(db, d.userId);
  if (!u || !u.isActive || u.role !== d.role || u.sessionVersion !== d.sv) return null;
  return u;
}
