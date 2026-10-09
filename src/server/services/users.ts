/**
 * Kullanıcı hesapları: yönetici (kullanıcı adı + şifre), kasiyer (ad + PIN).
 * Şifre/PIN değişince veya hesap pasife alınınca o kullanıcının açık oturumları geçersiz olur.
 */
import type { Ctx } from "../context";
import {
  countActiveOwners,
  findOwnerByUsername,
  getUserById,
  insertUser,
  listActiveCashiersWithPins,
  setUserSecret,
  updateUserFields,
  usernameTaken,
  getUserSecretsById,
  type User,
} from "../db/repositories/users";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { hashSecret, verifyDummy, verifySecret } from "../auth/passwords";
import { parseInput, z } from "../validation/zod";
import { audit } from "./audit";
import { stamp } from "./clock";

const nameSchema = z.string().trim().min(1, "Ad zorunludur.").max(60);
const usernameSchema = z
  .string()
  .trim()
  .min(3, "Kullanıcı adı en az 3 karakter olmalı.")
  .max(32)
  .regex(/^[a-zA-Z0-9._-]+$/, "Kullanıcı adında sadece harf (Türkçe karaktersiz), rakam, nokta, tire ve alt çizgi kullanın.");
const passwordSchema = z.string().min(8, "Şifre en az 8 karakter olmalı.").max(128);
const pinSchema = z.string().regex(/^\d{4,8}$/, "PIN 4-8 haneli rakam olmalı.");

export function hasOwner(ctx: Ctx): boolean {
  return countActiveOwners(ctx.db) > 0;
}

function assertPinUnique(ctx: Ctx, pin: string, exceptId?: number) {
  for (const c of listActiveCashiersWithPins(ctx.db)) {
    if (c.id !== exceptId && verifySecret(pin, c.pinHash)) {
      throw conflict("PIN_TAKEN", "Bu PIN başka bir kasiyer tarafından kullanılıyor. Farklı bir PIN seçin.");
    }
  }
}

export const setupSchema = z
  .object({ name: nameSchema, username: usernameSchema, password: passwordSchema, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { message: "Şifreler aynı değil.", path: ["passwordConfirm"] });

/** İlk kurulum: hiç yönetici yoksa ilk yönetici hesabını oluşturur. */
export function createFirstOwner(ctx: Ctx, input: z.input<typeof setupSchema>): User {
  const data = parseInput(setupSchema, input);
  const { nowIso } = stamp(ctx);
  const hash = hashSecret(data.password);
  return ctx.db
    .transaction((): User => {
      if (hasOwner(ctx)) throw forbidden("ALREADY_SET_UP", "Kurulum zaten yapılmış. Yönetici hesabıyla giriş yapın.");
      if (usernameTaken(ctx.db, data.username)) throw conflict("USERNAME_TAKEN", "Bu kullanıcı adı alınmış.");
      const id = insertUser(ctx.db, { role: "owner", name: data.name, username: data.username, passwordHash: hash, pinHash: null }, nowIso);
      const user = getUserById(ctx.db, id)!;
      audit({ ...ctx, actor: { userId: id, name: user.name, role: "owner" } }, "user.create", `İlk yönetici hesabı oluşturuldu: ${user.name} (${user.username})`, {
        entityType: "user",
        entityId: id,
      });
      return user;
    })
    .immediate();
}

export const createUserSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("cashier"), name: nameSchema, pin: pinSchema }),
  z.object({ role: z.literal("owner"), name: nameSchema, username: usernameSchema, password: passwordSchema }),
]);

export function createUser(ctx: Ctx, input: z.input<typeof createUserSchema>): User {
  const data = parseInput(createUserSchema, input);
  const { nowIso } = stamp(ctx);
  const secretHash = hashSecret(data.role === "cashier" ? data.pin : data.password);
  return ctx.db
    .transaction((): User => {
      if (data.role === "cashier") {
        assertPinUnique(ctx, data.pin);
        const id = insertUser(ctx.db, { role: "cashier", name: data.name, username: null, passwordHash: null, pinHash: secretHash }, nowIso);
        audit(ctx, "user.create", `Kasiyer eklendi: ${data.name}`, { entityType: "user", entityId: id });
        return getUserById(ctx.db, id)!;
      }
      if (usernameTaken(ctx.db, data.username)) throw conflict("USERNAME_TAKEN", "Bu kullanıcı adı alınmış.");
      const id = insertUser(ctx.db, { role: "owner", name: data.name, username: data.username, passwordHash: secretHash, pinHash: null }, nowIso);
      audit(ctx, "user.create", `Yönetici eklendi: ${data.name} (${data.username})`, { entityType: "user", entityId: id });
      return getUserById(ctx.db, id)!;
    })
    .immediate();
}

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    username: usernameSchema.optional(),
    isActive: z.boolean().optional(),
    pin: pinSchema.optional(),
    password: passwordSchema.optional(),
  })
  .strict();

export function updateUser(ctx: Ctx, id: number, input: z.input<typeof updateUserSchema>): User {
  const data = parseInput(updateUserSchema, input);
  const { nowIso } = stamp(ctx);
  const pinHash = data.pin ? hashSecret(data.pin) : null;
  const pwHash = data.password ? hashSecret(data.password) : null;
  return ctx.db
    .transaction((): User => {
      const u = getUserById(ctx.db, id);
      if (!u) throw notFound("USER_NOT_FOUND", "Kullanıcı bulunamadı.");
      const isSelf = ctx.actor?.userId === id;
      if (data.isActive === false) {
        if (isSelf) throw badRequest("CANNOT_DEACTIVATE_SELF", "Kendi hesabınızı pasife alamazsınız.");
        if (u.role === "owner" && u.isActive && countActiveOwners(ctx.db) <= 1) {
          throw badRequest("LAST_OWNER", "Son aktif yönetici pasife alınamaz.");
        }
      }
      if (u.role === "cashier" && (data.username || data.password)) throw badRequest("BAD_FIELD", "Kasiyerin kullanıcı adı/şifresi olmaz; PIN kullanılır.");
      if (u.role === "owner" && data.pin) throw badRequest("BAD_FIELD", "Yöneticiler şifre ile girer; PIN kullanılmaz.");
      if (data.username && usernameTaken(ctx.db, data.username, id)) throw conflict("USERNAME_TAKEN", "Bu kullanıcı adı alınmış.");
      if (data.pin) assertPinUnique(ctx, data.pin, id);
      // Tekrar aktif edilen kasiyerin eski PIN'i bu arada başka kasiyere verilmiş olabilir (hash'ler karşılaştırılamaz):
      // yeni PIN zorunlu.
      if (data.isActive === true && u.role === "cashier" && !u.isActive && !data.pin) {
        throw badRequest("PIN_REQUIRED", "Kasiyeri tekrar aktif yaparken yeni bir PIN belirleyin.");
      }

      updateUserFields(ctx.db, id, { name: data.name, username: data.username, isActive: data.isActive }, nowIso);
      if (pinHash) setUserSecret(ctx.db, id, "pin", pinHash, nowIso);
      if (pwHash) setUserSecret(ctx.db, id, "password", pwHash, nowIso);

      const changes: string[] = [];
      if (data.name !== undefined && data.name !== u.name) changes.push(`ad: ${u.name} → ${data.name}`);
      if (data.username !== undefined && data.username !== u.username) changes.push(`kullanıcı adı: ${u.username} → ${data.username}`);
      if (data.isActive !== undefined && data.isActive !== u.isActive) changes.push(data.isActive ? "aktif yapıldı" : "pasife alındı");
      if (changes.length) audit(ctx, "user.update", `${u.name}: ${changes.join(", ")}`, { entityType: "user", entityId: id });
      if (pinHash || pwHash) audit(ctx, "user.secret", `${u.name}: ${pinHash ? "PIN" : "şifre"} değiştirildi`, { entityType: "user", entityId: id });
      return getUserById(ctx.db, id)!;
    })
    .immediate();
}

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1), newPassword: passwordSchema, newPasswordConfirm: z.string() })
  .refine((d) => d.newPassword === d.newPasswordConfirm, { message: "Yeni şifreler aynı değil.", path: ["newPasswordConfirm"] });

/** Yöneticinin kendi şifresini değiştirmesi (mevcut şifre doğrulanır). */
export function changeOwnPassword(ctx: Ctx, input: z.input<typeof changePasswordSchema>): User {
  const data = parseInput(changePasswordSchema, input);
  const me = ctx.actor?.userId ? getUserById(ctx.db, ctx.actor.userId) : undefined;
  if (!me || me.role !== "owner") throw forbidden("FORBIDDEN", "Bu işlem için yetkiniz yok.");
  if (!verifySecret(data.currentPassword, getUserSecretsById(ctx.db, me.id)?.passwordHash)) {
    throw badRequest("WRONG_PASSWORD", "Mevcut şifre hatalı.");
  }
  const { nowIso } = stamp(ctx);
  const hash = hashSecret(data.newPassword);
  ctx.db
    .transaction(() => {
      setUserSecret(ctx.db, me.id, "password", hash, nowIso);
      audit(ctx, "user.secret", `${me.name}: kendi şifresini değiştirdi`, { entityType: "user", entityId: me.id });
    })
    .immediate();
  return getUserById(ctx.db, me.id)!;
}

/** Yönetici girişi. Başarısızsa null (kullanıcı yoksa da aynı sürede yanıt). */
export function authenticateOwner(ctx: Ctx, username: string, password: string): User | null {
  const u = findOwnerByUsername(ctx.db, username.trim());
  if (!u) {
    verifyDummy(password);
    return null;
  }
  if (!verifySecret(password, u.passwordHash) || !u.isActive) return null;
  return getUserById(ctx.db, u.id)!;
}

/** Kasiyer girişi: PIN aktif kasiyerlerden biriyle eşleşirse o kasiyer. */
export function authenticateCashier(ctx: Ctx, pin: string): User | null {
  if (!/^\d{4,8}$/.test(pin)) return null;
  const match = listActiveCashiersWithPins(ctx.db).find((c) => verifySecret(pin, c.pinHash));
  if (!match) verifyDummy(pin);
  return match ? getUserById(ctx.db, match.id)! : null;
}

/** Komut satırından şifre sıfırlama (yönetici şifresini unutursa). */
export function resetOwnerPassword(ctx: Ctx, username: string, newPassword: string): User {
  parseInput(passwordSchema, newPassword);
  const u = findOwnerByUsername(ctx.db, username.trim());
  if (!u) throw notFound("USER_NOT_FOUND", "Bu kullanıcı adında yönetici yok.");
  const { nowIso } = stamp(ctx);
  ctx.db
    .transaction(() => {
      setUserSecret(ctx.db, u.id, "password", hashSecret(newPassword), nowIso);
      if (!u.isActive) updateUserFields(ctx.db, u.id, { isActive: true }, nowIso);
      audit(ctx, "user.secret", `${u.name}: şifre bilgisayardan sıfırlandı`, { entityType: "user", entityId: u.id });
    })
    .immediate();
  return getUserById(ctx.db, u.id)!;
}
