import { sealData } from "iron-session";
import { getSessionSecret } from "@/server/auth/secret";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";
import type { User } from "@/server/db/repositories/users";
import { setTestMailSender, type MailMessage } from "@/server/mail";
import { createFirstOwner, createUser } from "@/server/services/users";
import type { TestEnv } from "./helpers";

export const TEST_OWNER = { name: "Ayşe Yönetici", username: "yonetici", password: "gizli-sifre-123", email: "yonetici@test.local" };
export const TEST_CASHIER = { name: "Mehmet Kasiyer", pin: "8765" };

const cache = new WeakMap<TestEnv, { owner: User; cashier: User }>();

/** Test veritabanına bir yönetici ve bir kasiyer ekler (ortam başına bir kez). */
export function ensureUsers(env: TestEnv): { owner: User; cashier: User } {
  let u = cache.get(env);
  if (!u) {
    const owner = createFirstOwner(env.ctx, { ...TEST_OWNER, passwordConfirm: TEST_OWNER.password });
    const cashier = createUser({ ...env.ctx, actor: { userId: owner.id, name: owner.name, role: "owner" } }, { role: "cashier", ...TEST_CASHIER });
    u = { owner, cashier };
    cache.set(env, u);
  }
  return u;
}

/** Kullanıcıya ait geçerli oturum çerezi (gerçek girişte oluşanla aynı içerik). */
export async function cookieForUser(user: User): Promise<string> {
  const seal = await sealData(
    { userId: user.id, role: user.role, name: user.name, sv: user.sessionVersion, loginAt: new Date().toISOString() },
    { password: getSessionSecret(), ttl: SESSION_TTL_SECONDS },
  );
  return `${SESSION_COOKIE}=${seal}`;
}

export async function sessionCookie(env: TestEnv, role: "owner" | "cashier"): Promise<string> {
  const u = ensureUsers(env);
  return cookieForUser(role === "owner" ? u.owner : u.cashier);
}

/** Gönderilen e-postaları yakalar (gerçek gönderim yapılmaz). */
export function captureMail(): { sent: MailMessage[]; lastCode: () => string; stop: () => void } {
  const sent: MailMessage[] = [];
  setTestMailSender({ send: async (m) => void sent.push(m) });
  return {
    sent,
    lastCode: () => {
      const m = /(\d{6})/.exec(sent.at(-1)?.subject ?? "");
      if (!m) throw new Error("e-postada kod yok");
      return m[1]!;
    },
    stop: () => setTestMailSender(null),
  };
}
