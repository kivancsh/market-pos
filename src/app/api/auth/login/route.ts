import type { Ctx } from "@/server/context";
import { lockRemainingMs, recordFailure, recordSuccess, type LimiterKey } from "@/server/auth/loginLimiter";
import { startSession } from "@/server/auth/startSession";
import { AppError, conflict } from "@/server/errors";
import { apiRoute, readJson } from "@/server/http/api";
import { audit } from "@/server/services/audit";
import { authenticateCashier, authenticateOwner, hasOwner } from "@/server/services/users";
import { parseInput, z } from "@/server/validation/zod";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("cashier"), pin: z.string().trim().min(1).max(16) }),
  z.object({ mode: z.literal("owner"), username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) }),
]);

function lockedError(remainingMs: number) {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return new AppError("LOGIN_LOCKED", `Çok fazla hatalı deneme. ${minutes} dakika sonra tekrar deneyin.`, 429, {
    retryAfterSeconds: Math.ceil(remainingMs / 1000),
  });
}

export const POST = apiRoute("public", async ({ req, ctx, session }) => {
  const data = parseInput(schema, await readJson(req));
  if (!hasOwner(ctx)) throw conflict("SETUP_REQUIRED", "Önce kurulum yapılmalı: yönetici hesabı oluşturun.");
  const key: LimiterKey = data.mode;
  const now = ctx.now();
  const remaining = lockRemainingMs(key, now.getTime());
  if (remaining > 0) throw lockedError(remaining);

  const user = data.mode === "owner" ? authenticateOwner(ctx, data.username, data.password) : authenticateCashier(ctx, data.pin);
  if (!user) {
    const r = recordFailure(key, now.getTime());
    const who = data.mode === "owner" ? `yönetici "${data.username}"` : "kasiyer PIN";
    ctx.db.transaction(() => audit(ctx, "auth.login_failed", `Hatalı giriş denemesi (${who})`)).immediate();
    if (r.locked) throw lockedError(5 * 60_000);
    throw new AppError(
      "WRONG_CREDENTIALS",
      `${data.mode === "owner" ? "Kullanıcı adı veya şifre" : "PIN"} hatalı. Kalan deneme: ${r.remainingAttempts}`,
      401,
      { remainingAttempts: r.remainingAttempts },
    );
  }
  recordSuccess(key);
  await startSession(session, user, now);
  const actorCtx: Ctx = { ...ctx, actor: { userId: user.id, name: user.name, role: user.role } };
  ctx.db.transaction(() => audit(actorCtx, "auth.login", `${user.name} giriş yaptı (${user.role === "owner" ? "yönetici" : "kasiyer"})`)).immediate();
  return { role: user.role, name: user.name };
});
