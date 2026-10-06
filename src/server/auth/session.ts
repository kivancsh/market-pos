import { getIronSession, unsealData, webCookies, type IronSession, type SessionOptions } from "iron-session";
import type { Role } from "../db/repositories/sales";
import { getSessionSecret } from "./secret";

export interface SessionData {
  role: Role;
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

/** Ham çerez değerinden rolü okur (proxy ve sayfalar için). Geçersizse null. */
export async function readRoleFromCookie(value: string | undefined): Promise<Role | null> {
  if (!value) return null;
  try {
    const data = await unsealData<Partial<SessionData>>(value, {
      password: getSessionSecret(),
      ttl: SESSION_TTL_SECONDS,
    });
    return data.role === "owner" || data.role === "cashier" ? data.role : null;
  } catch {
    return null;
  }
}
