import type { IronSession } from "iron-session";
import type { Ctx } from "../context";
import { getDb } from "../db/connection";
import type { Role } from "../db/repositories/sales";
import { getRequestSession, resolveSessionUser, type SessionData } from "../auth/session";
import type { User } from "../db/repositories/users";
import { AppError } from "../errors";
import { z } from "../validation/zod";

export interface ApiArgs<P> {
  req: Request;
  params: P;
  ctx: Ctx;
  session: IronSession<SessionData>;
  /** Oturumdaki rol (public uçlarda null olabilir). */
  role: Role | null;
  /** Oturumdaki geçerli kullanıcı (public uçlarda null olabilir). */
  user: User | null;
}

type Access = "public" | Role[];

/** Uygulama bağlamı. Testler `setTestCtxFactory` ile bellek içi veritabanı verebilir. */
const g = globalThis as unknown as { __ctxFactory?: () => Ctx };
export function setTestCtxFactory(f: (() => Ctx) | undefined): void {
  g.__ctxFactory = f;
}
function makeCtx(): Ctx {
  return g.__ctxFactory ? g.__ctxFactory() : { db: getDb(), now: () => new Date() };
}

/** Oturumsuz, cihazdan gelen istekler için bağlam (ör. yazar kasa). */
export function deviceCtx(): Ctx {
  return makeCtx();
}

export function errorBody(code: string, message: string, details?: unknown) {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/**
 * Basit CSRF koruması: veri değiştiren isteklerde Origin başlığı varsa Host ile aynı olmalı.
 * (Çerez ayrıca SameSite=Lax; başka sitelerden gelen POST'larda gönderilmez.)
 */
function checkOrigin(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("BAD_ORIGIN", "İstek reddedildi.", 403);
  }
  if (!host || originHost !== host) throw new AppError("BAD_ORIGIN", "İstek reddedildi.", 403);
}

/**
 * API ucu sarmalayıcısı: oturum + rol kontrolü (sunucu tarafında), hataları tek biçime çevirme,
 * önbelleği kapatma. Handler düz bir nesne dönerse JSON'a çevrilir.
 */
export function apiRoute<P = Record<string, never>>(
  access: Access,
  handler: (args: ApiArgs<P>) => Promise<unknown> | unknown,
) {
  return async (req: Request, routeCtx?: { params: Promise<P> }): Promise<Response> => {
    const resHeaders = new Headers({ "Cache-Control": "no-store" });
    try {
      checkOrigin(req);
      const session = await getRequestSession(req, resHeaders);
      const base = makeCtx();
      // Oturum her istekte veritabanından doğrulanır (hesap pasife alındıysa / şifre değiştiyse geçersiz).
      const user = resolveSessionUser(base.db, session);
      const role = user?.role ?? null;
      if (access !== "public") {
        if (!role) throw new AppError("UNAUTHORIZED", "Oturum süresi doldu. Lütfen tekrar giriş yapın.", 401);
        if (!access.includes(role)) throw new AppError("FORBIDDEN", "Bu işlem için yetkiniz yok.", 403);
      }
      const ctx: Ctx = user ? { ...base, actor: { userId: user.id, name: user.name, role: user.role } } : base;
      const params = (routeCtx ? await routeCtx.params : {}) as P;
      const result = await handler({ req, params, ctx, session, role, user });
      if (result instanceof Response) {
        resHeaders.forEach((v, k) => result.headers.set(k, v));
        return result;
      }
      return Response.json(result ?? { ok: true }, { headers: resHeaders });
    } catch (e) {
      if (e instanceof AppError) {
        return Response.json(errorBody(e.code, e.message, e.details), { status: e.status, headers: resHeaders });
      }
      console.error("[api] beklenmeyen hata:", e);
      return Response.json(errorBody("INTERNAL_ERROR", "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."), {
        status: 500,
        headers: resHeaders,
      });
    }
  };
}

/** İstek gövdesini JSON olarak okur; bozuksa 400. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("INVALID_JSON", "Gönderilen veri okunamadı.", 400);
  }
}

const idParam = z.coerce.number().int().positive();

/** URL'deki sayısal id parametresi. */
export function parseId(value: string | undefined): number {
  const r = idParam.safeParse(value);
  if (!r.success) throw new AppError("NOT_FOUND", "Kayıt bulunamadı.", 404);
  return r.data;
}
