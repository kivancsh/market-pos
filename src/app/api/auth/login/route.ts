import { lockRemainingMs, recordFailure, recordSuccess } from "@/server/auth/loginLimiter";
import { matchPin } from "@/server/auth/pins";
import { AppError } from "@/server/errors";
import { apiRoute, readJson } from "@/server/http/api";
import { parseInput, z } from "@/server/validation/zod";

const schema = z.object({ pin: z.string().trim().min(1).max(16) });

export const POST = apiRoute("public", async ({ req, session }) => {
  const { pin } = parseInput(schema, await readJson(req));
  const now = Date.now();
  const remaining = lockRemainingMs(now);
  if (remaining > 0) {
    const minutes = Math.ceil(remaining / 60_000);
    throw new AppError("LOGIN_LOCKED", `Çok fazla hatalı deneme. ${minutes} dakika sonra tekrar deneyin.`, 429, {
      retryAfterSeconds: Math.ceil(remaining / 1000),
    });
  }
  const role = matchPin(pin);
  if (!role) {
    const r = recordFailure(now);
    throw r.locked
      ? new AppError("LOGIN_LOCKED", "Çok fazla hatalı deneme. 5 dakika sonra tekrar deneyin.", 429, {
          retryAfterSeconds: 300,
        })
      : new AppError("WRONG_PIN", `PIN hatalı. Kalan deneme: ${r.remainingAttempts}`, 401, {
          remainingAttempts: r.remainingAttempts,
        });
  }
  recordSuccess();
  session.role = role;
  session.loginAt = new Date(now).toISOString();
  await session.save();
  return { role };
});
