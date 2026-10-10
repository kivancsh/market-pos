import type { DB } from "../types";
import type { Role } from "./sales";

export interface User {
  id: number;
  role: Role;
  name: string;
  username: string | null;
  /** Yönetici e-postası (onay kodları, günlük rapor). */
  email: string | null;
  /** Kasiyer numarası (girişte No + PIN). */
  cashierNo: number | null;
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

const SELECT = `SELECT id, role, name, username, email, cashier_no AS cashierNo,
                       password_hash AS passwordHash, pin_hash AS pinHash,
                       is_active AS isActive, session_version AS sessionVersion,
                       created_at AS createdAt, updated_at AS updatedAt
                  FROM users`;

/** Hash alanları dışarı çıkmaz. */
const toUser = (r: UserRaw): User => ({
  id: r.id,
  role: r.role,
  name: r.name,
  username: r.username,
  email: r.email,
  cashierNo: r.cashierNo,
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

/** Kasiyer girişi için: numarası verilen aktif kasiyer (PIN hash'iyle). */
export function findActiveCashierByNo(db: DB, cashierNo: number): (User & { pinHash: string }) | undefined {
  const r = db.prepare(`${SELECT} WHERE role = 'cashier' AND is_active = 1 AND cashier_no = ?`).get(cashierNo) as
    | UserRaw
    | undefined;
  return r && { ...toUser(r), pinHash: r.pinHash! };
}

/** Yeni kasiyere verilecek numara (1001'den başlar, hiç tekrar kullanılmaz). Transaction içinde çağrılmalı. */
export function nextCashierNo(db: DB): number {
  const r = db.prepare("SELECT MAX(cashier_no) AS m FROM users").get() as { m: number | null };
  return Math.max(1000, r.m ?? 1000) + 1;
}

/** E-postası olan aktif yöneticiler (günlük rapor alıcıları). */
export function listActiveOwnerEmails(db: DB): string[] {
  return (
    db.prepare("SELECT DISTINCT email FROM users WHERE role = 'owner' AND is_active = 1 AND email IS NOT NULL AND email <> ''").all() as {
      email: string;
    }[]
  ).map((r) => r.email);
}

export function setUserEmail(db: DB, id: number, email: string, nowIso: string): void {
  db.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ?").run(email, nowIso, id);
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
  u: {
    role: Role;
    name: string;
    username: string | null;
    passwordHash: string | null;
    pinHash: string | null;
    email?: string | null;
    cashierNo?: number | null;
  },
  nowIso: string,
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO users (role, name, username, password_hash, pin_hash, email, cashier_no, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(u.role, u.name, u.username, u.passwordHash, u.pinHash, u.email ?? null, u.cashierNo ?? null, nowIso, nowIso)
      .lastInsertRowid,
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
