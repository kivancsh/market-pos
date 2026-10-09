import type { DB } from "../types";
import type { Role } from "./sales";

export interface User {
  id: number;
  role: Role;
  name: string;
  username: string | null;
  isActive: boolean;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface UserRaw extends Omit<User, "isActive"> {
  isActive: number;
  passwordHash: string | null;
  pinHash: string | null;
}

const SELECT = `SELECT id, role, name, username, password_hash AS passwordHash, pin_hash AS pinHash,
                       is_active AS isActive, session_version AS sessionVersion,
                       created_at AS createdAt, updated_at AS updatedAt
                  FROM users`;

/** Hash alanları dışarı çıkmaz. */
const toUser = (r: UserRaw): User => ({
  id: r.id,
  role: r.role,
  name: r.name,
  username: r.username,
  isActive: r.isActive === 1,
  sessionVersion: r.sessionVersion,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export function getUserById(db: DB, id: number): User | undefined {
  const r = db.prepare(`${SELECT} WHERE id = ?`).get(id) as UserRaw | undefined;
  return r && toUser(r);
}

/** Kimlik doğrulama için hash'lerle birlikte. */
export function getUserSecretsById(db: DB, id: number): { passwordHash: string | null; pinHash: string | null } | undefined {
  return db.prepare("SELECT password_hash AS passwordHash, pin_hash AS pinHash FROM users WHERE id = ?").get(id) as
    | { passwordHash: string | null; pinHash: string | null }
    | undefined;
}

export function findOwnerByUsername(db: DB, username: string): (User & { passwordHash: string | null }) | undefined {
  const r = db.prepare(`${SELECT} WHERE role = 'owner' AND username = ?`).get(username) as UserRaw | undefined;
  return r && { ...toUser(r), passwordHash: r.passwordHash };
}

export function listActiveCashiersWithPins(db: DB): (User & { pinHash: string })[] {
  return (db.prepare(`${SELECT} WHERE role = 'cashier' AND is_active = 1 ORDER BY id`).all() as UserRaw[]).map((r) => ({
    ...toUser(r),
    pinHash: r.pinHash!,
  }));
}

export function listUsers(db: DB): User[] {
  return (db.prepare(`${SELECT} ORDER BY role DESC, is_active DESC, name COLLATE NOCASE`).all() as UserRaw[]).map(toUser);
}

export function countActiveOwners(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND is_active = 1").get() as { n: number }).n;
}

export function usernameTaken(db: DB, username: string, exceptId?: number): boolean {
  return !!db.prepare("SELECT 1 FROM users WHERE username = ? AND id <> ?").get(username, exceptId ?? 0);
}

export function insertUser(
  db: DB,
  u: { role: Role; name: string; username: string | null; passwordHash: string | null; pinHash: string | null },
  nowIso: string,
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO users (role, name, username, password_hash, pin_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(u.role, u.name, u.username, u.passwordHash, u.pinHash, nowIso, nowIso).lastInsertRowid,
  );
}

export function updateUserFields(
  db: DB,
  id: number,
  patch: { name?: string; username?: string; isActive?: boolean },
  nowIso: string,
): void {
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    vals.push(patch.name);
  }
  if (patch.username !== undefined) {
    sets.push("username = ?");
    vals.push(patch.username);
  }
  if (patch.isActive !== undefined) {
    sets.push("is_active = ?", "session_version = session_version + 1");
    vals.push(patch.isActive ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  vals.push(nowIso, id);
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

/** Şifre veya PIN değişir; mevcut oturumlar geçersiz olur. */
export function setUserSecret(db: DB, id: number, kind: "password" | "pin", hash: string, nowIso: string): void {
  const col = kind === "password" ? "password_hash" : "pin_hash";
  db.prepare(`UPDATE users SET ${col} = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?`).run(hash, nowIso, id);
}
