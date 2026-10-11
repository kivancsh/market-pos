/**
 * Hugin Cloud Link HTTP katmanı: Hugin'in beklediği yanıt zarfı ({ status, data?, error?, metadata }) ve
 * X-ApiKey doğrulaması. Bu uçlar oturum kullanmaz; yalnız Ayarlar'da üretilen şifreyle çalışır.
 */
import type { Ctx } from "../context";
import { deviceCtx } from "../http/api";
import { verifyHuginApiKey } from "../services/okc";

function metadata(instance?: string, extra: Record<string, unknown> = {}) {
  return { timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), ...(instance ? { instance } : {}), ...extra };
}

export function huginJson(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function huginOk(data?: unknown, extra: Record<string, unknown> = {}): Response {
  return huginJson(200, { status: "SUCCESS", ...(data === undefined ? {} : { data }), metadata: metadata(undefined, extra) });
}

export function huginError(status: number, code: string, title: string, description: string, instance: string): Response {
  return huginJson(status, { status: status === 404 ? "NOT FOUND" : "ERROR", error: { code, title, description }, metadata: metadata(instance) });
}

/** X-ApiKey doğrulanır, Hugin bağlantısı Ayarlar'da açık değilse istek reddedilir. */
export async function withHugin(req: Request, instance: string, handler: (ctx: Ctx) => Promise<Response> | Response): Promise<Response> {
  try {
    const ctx = deviceCtx();
    if (!verifyHuginApiKey(ctx.db, req.headers.get("x-apikey"))) {
      return huginError(401, "PASSWORD_NOT_ACCEPTED", "Şifre hatalı", "Şifre hatalı veya Hugin bağlantısı kapalı.", instance);
    }
    return await handler(ctx);
  } catch (e) {
    console.error("[hugin]", e);
    return huginError(500, "ERR_INTERNAL", "Sunucu hatası", "İstek işlenemedi.", instance);
  }
}

export async function readBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.length > 512 * 1024) return null;
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
