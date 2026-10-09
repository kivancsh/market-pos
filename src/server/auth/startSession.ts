import type { IronSession } from "iron-session";
import type { User } from "../db/repositories/users";
import type { SessionData } from "./session";

/** Oturumu kullanıcıyla başlatır (veya şifre değişince yeniler). */
export async function startSession(session: IronSession<SessionData>, user: User, now: Date): Promise<void> {
  session.userId = user.id;
  session.role = user.role;
  session.name = user.name;
  session.sv = user.sessionVersion;
  session.loginAt = now.toISOString();
  await session.save();
}
