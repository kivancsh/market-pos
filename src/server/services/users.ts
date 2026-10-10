/**
 * Kullanıcı hesapları: yönetici (kullanıcı adı + şifre, e-posta isteğe bağlı), kasiyer (Kasiyer No + PIN).
 * İlk kurulum e-postasız ve tek adımdır (kullanıcı kararı: kurulum basit olmalı).
 * Şifre/PIN değiştirme ve sıfırlama yöneticidedir. E-posta gönderimi bağlıysa ve yöneticinin e-postası varsa her seferinde
 * e-postaya giden onay koduyla yapılır; değilse doğrudan (yönetici kendi şifresinde mevcut şifresini yazar).
 * Şifre/PIN değişince veya hesap pasife alınınca o kullanıcının açık oturumları geçersiz olur.
 */
import type { Ctx } from "../context";
import type { VerificationRow } from "../db/repositories/verification";
import {
  countActiveOwners,
  findActiveCashierByNo,
  findOwnerByUsername,
  nextCashierNo,
  setUserEmail,
  getUserById,
  insertUser,
  listActiveCashiersWithPins,
  setUserSecret,
  updateUserFields,
  usernameTaken,
  type User,
} from "../db/repositories/users";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { hashSecret, verifyDummy, verifySecret } from "../auth/passwords";
import { isMailConfigured } from "../mail";
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
export const emailSchema = z.string().trim().toLowerCase().max(120).pipe(z.email("Geçerli bir e-posta adresi yazın."));

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

const setupBase = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema.nullish(),
  password: passwordSchema,
  passwordConfirm: z.string(),
});
export const setupSchema = setupBase.refine((d) => d.password === d.passwordConfirm, { message: "Şifreler aynı değil.", path: ["passwordConfirm"] });

/** İlk kurulum (tek adım, e-postasız): ilk yönetici hesabı hemen oluşur. Sadece hiç yönetici yokken. */
export function setupOwner(ctx: Ctx, input: unknown): User {
  const data = parseInput(setupSchema, input);
  return insertFirstOwner(ctx, data.name, data.username, hashSecret(data.password), data.email ?? null);
}

function insertFirstOwner(ctx: Ctx, name: string, username: string, passwordHash: string, email: string | null): User {
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction((): User => {
      if (hasOwner(ctx)) throw forbidden("ALREADY_SET_UP", "Kurulum zaten yapılmış. Yönetici hesabıyla giriş yapın.");
      if (usernameTaken(ctx.db, username)) throw conflict("USERNAME_TAKEN", "Bu kullanıcı adı alınmış.");
      const id = insertUser(ctx.db, { role: "owner", name, username, passwordHash, pinHash: null, email }, nowIso);
      const user = getUserById(ctx.db, id)!;
      audit(
        { ...ctx, actor: { userId: id, name: user.name, role: "owner" } },
        "user.create",
        `İlk yönetici hesabı oluşturuldu: ${user.name} (${user.username})`,
        { entityType: "user", entityId: id },
      );
      return user;
    })
    .immediate();
}

/** Bilgisayardan (komut satırı) ilk yönetici. */
export function createFirstOwner(ctx: Ctx, input: { name: string; username: string; password: string; passwordConfirm: string; email?: string | null }): User {
  const data = parseInput(setupBase, input);
  if (data.password !== data.passwordConfirm) throw badRequest("PASSWORD_MISMATCH", "Şifreler aynı değil.");
  return insertFirstOwner(ctx, data.name, data.username, hashSecret(data.password), data.email ?? null);
}

export const createUserSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("cashier"), name: nameSchema, pin: pinSchema }),
  z.object({ role: z.literal("owner"), name: nameSchema, username: usernameSchema, email: emailSchema.nullish(), password: passwordSchema }),
]);

export function createUser(ctx: Ctx, input: z.input<typeof createUserSchema>): User {
  const data = parseInput(createUserSchema, input);
  const { nowIso } = stamp(ctx);
  const secretHash = hashSecret(data.role === "cashier" ? data.pin : data.password);
  return ctx.db
    .transaction((): User => {
      if (data.role === "cashier") {
        assertPinUnique(ctx, data.pin);
        const cashierNo = nextCashierNo(ctx.db);
        const id = insertUser(
          ctx.db,
          { role: "cashier", name: data.name, username: null, passwordHash: null, pinHash: secretHash, cashierNo },
          nowIso,
        );
        audit(ctx, "user.create", `Kasiyer eklendi: ${data.name} (Kasiyer No ${cashierNo})`, { entityType: "user", entityId: id });
        return getUserById(ctx.db, id)!;
      }
      if (usernameTaken(ctx.db, data.username)) throw conflict("USERNAME_TAKEN", "Bu kullanıcı adı alınmış.");
      const id = insertUser(
        ctx.db,
        { role: "owner", name: data.name, username: data.username, passwordHash: secretHash, pinHash: null, email: data.email ?? null },
        nowIso,
      );
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
  })
  .strict();

export function updateUser(ctx: Ctx, id: number, input: z.input<typeof updateUserSchema>): User {
  const data = parseInput(updateUserSchema, input);
  const { nowIso } = stamp(ctx);
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
      if (u.role === "cashier" && data.username) throw badRequest("BAD_FIELD", "Kasiyerin kullanıcı adı olmaz; Kasiyer No kullanılır.");
      if (data.username && usernameTaken(ctx.db, data.username, id)) throw conflict("USERNAME_TAKEN", "Bu kullanıcı adı alınmış.");
      // Tekrar aktif edilen kasiyerin eski PIN'i bu arada başka kasiyere verilmiş olabilir (hash'ler karşılaştırılamaz):
      // yeni PIN zorunlu → "PIN değiştir" akışıyla (activate) aktif edilir.
      if (data.isActive === true && u.role === "cashier" && !u.isActive) {
        throw badRequest("PIN_REQUIRED", "Kasiyeri tekrar aktif yapmak için yeni bir PIN belirleyin.");
      }

      updateUserFields(ctx.db, id, { name: data.name, username: data.username, isActive: data.isActive }, nowIso);

      const changes: string[] = [];
      if (data.name !== undefined && data.name !== u.name) changes.push(`ad: ${u.name} → ${data.name}`);
      if (data.username !== undefined && data.username !== u.username) changes.push(`kullanıcı adı: ${u.username} → ${data.username}`);
      if (data.isActive !== undefined && data.isActive !== u.isActive) changes.push(data.isActive ? "aktif yapıldı" : "pasife alındı");
      if (changes.length) audit(ctx, "user.update", `${u.name}: ${changes.join(", ")}`, { entityType: "user", entityId: id });
      return getUserById(ctx.db, id)!;
    })
    .immediate();
}

// ------------------------------------------------------------------ şifre/PIN değiştirme (e-posta kodlu ya da doğrudan)

/**
 * Bu yönetici için şifre/PIN değişiklikleri e-posta koduyla mı yapılır? E-posta gönderimi bağlı ve yöneticinin
 * e-postası varsa evet (güvenlik); değilse doğrudan yapılır (e-posta isteğe bağlı).
 */
export function secretChangeNeedsCode(ctx: Ctx, owner: Pick<User, "email">): boolean {
  return Boolean(owner.email) && isMailConfigured(ctx.db);
}

function actorOwner(ctx: Ctx): User {
  const me = ctx.actor?.userId ? getUserById(ctx.db, ctx.actor.userId) : undefined;
  if (!me || me.role !== "owner" || !me.isActive) throw forbidden("FORBIDDEN", "Bu işlem için yetkiniz yok.");
  return me;
}

/** İşlemi yapan yöneticinin e-postası (kodlar buraya gider). */
function actorOwnerWithEmail(ctx: Ctx): User & { email: string } {
  const me = actorOwner(ctx);
  if (!me.email) {
    throw badRequest("EMAIL_REQUIRED", "Onay kodu gönderebilmek için önce Yönetici Paneli → Hesabım'dan e-posta adresinizi ekleyin.");
  }
  return me as User & { email: string };
}

const describe = (u: User) =>
  u.role === "cashier" ? `${u.name} (Kasiyer No ${u.cashierNo})` : `${u.name} (${u.username})`;

/** Şifre/PIN değiştirme 1. adım: hedef kullanıcıyı kontrol eder; kod işlemi yapan yöneticinin e-postasına gider. */
export function prepareSecretChange(ctx: Ctx, targetId: number): { email: string; userId: number; action: string; payload: { targetId: number } } {
  const me = actorOwnerWithEmail(ctx);
  const target = getUserById(ctx.db, targetId);
  if (!target) throw notFound("USER_NOT_FOUND", "Kullanıcı bulunamadı.");
  const what = target.role === "cashier" ? "yeni PIN belirleme" : "yeni şifre belirleme";
  return { email: me.email, userId: me.id, action: `${describe(target)} için ${what}`, payload: { targetId } };
}

export const secretChangeSchema = z.object({
  secret: z.string(),
  secretConfirm: z.string(),
  /** Pasif kasiyeri yeni PIN'le tekrar aktif yap */
  activate: z.boolean().optional(),
});

/** Kod doğrulanmadan önce yeni şifre/PIN'in kurallara uyduğunu kontrol eder (kod boşa gitmesin). */
export function validateSecretChange(ctx: Ctx, targetId: number, input: unknown): z.infer<typeof secretChangeSchema> {
  const data = parseInput(secretChangeSchema, input);
  const target = getUserById(ctx.db, targetId);
  if (!target) throw notFound("USER_NOT_FOUND", "Kullanıcı bulunamadı.");
  parseInput(target.role === "cashier" ? pinSchema : passwordSchema, data.secret);
  if (data.secret !== data.secretConfirm) {
    throw badRequest("SECRET_MISMATCH", target.role === "cashier" ? "PIN'ler aynı değil." : "Şifreler aynı değil.");
  }
  if (target.role === "cashier") assertPinUnique(ctx, data.secret, targetId);
  return data;
}

/** Şifre/PIN değiştirme 2. adım (kod doğrulandıktan sonra). */
export function applySecretChange(ctx: Ctx, row: VerificationRow, targetId: number, data: z.infer<typeof secretChangeSchema>): User {
  const p = JSON.parse(row.payloadJson ?? "{}") as { targetId?: number };
  if (p.targetId !== targetId || row.userId !== ctx.actor?.userId) throw badRequest("CODE_INVALID", "Bu kod bu işlem için değil. Yeni kod isteyin.");
  return writeSecret(ctx, targetId, data, "e-posta onaylı");
}

/**
 * E-posta bağlı değilken doğrudan şifre/PIN değiştirme. E-posta kodu kullanılabiliyorsa reddedilir (kod zorunlu).
 * Yönetici kendi şifresini değiştiriyorsa mevcut şifresini de yazar.
 */
export function changeSecretDirect(ctx: Ctx, targetId: number, input: unknown): User {
  const me = actorOwner(ctx);
  if (secretChangeNeedsCode(ctx, me)) throw conflict("CODE_REQUIRED", "Bu değişiklik e-postanıza gelen onay koduyla yapılır.");
  const data = validateSecretChange(ctx, targetId, input);
  if (targetId === me.id) {
    const current = (input as { currentPassword?: unknown } | null)?.currentPassword;
    const row = findOwnerByUsername(ctx.db, me.username ?? "");
    if (typeof current !== "string" || !row || !verifySecret(current, row.passwordHash)) {
      throw badRequest("WRONG_PASSWORD", "Mevcut şifreniz hatalı.");
    }
  }
  return writeSecret(ctx, targetId, data, "e-posta bağlı değil");
}

function writeSecret(ctx: Ctx, targetId: number, data: z.infer<typeof secretChangeSchema>, how: string): User {
  const { nowIso } = stamp(ctx);
  const hash = hashSecret(data.secret);
  return ctx.db
    .transaction((): User => {
      const u = getUserById(ctx.db, targetId);
      if (!u) throw notFound("USER_NOT_FOUND", "Kullanıcı bulunamadı.");
      if (u.role === "cashier") assertPinUnique(ctx, data.secret, targetId);
      setUserSecret(ctx.db, targetId, u.role === "cashier" ? "pin" : "password", hash, nowIso);
      if (data.activate && u.role === "cashier" && !u.isActive) updateUserFields(ctx.db, targetId, { isActive: true }, nowIso);
      const self = targetId === ctx.actor?.userId;
      audit(
        ctx,
        "user.secret",
        `${describe(u)}: ${u.role === "cashier" ? "PIN" : "şifre"} ${self ? "(kendi) " : ""}değiştirildi${data.activate && !u.isActive ? ", tekrar aktif yapıldı" : ""} (${how})`,
        { entityType: "user", entityId: targetId },
      );
      return getUserById(ctx.db, targetId)!;
    })
    .immediate();
}

/** Şifremi unuttum 1. adım (giriş ekranı, oturumsuz). */
export function prepareForgotPassword(ctx: Ctx, username: string): { email: string; userId: number; action: string } {
  const u = findOwnerByUsername(ctx.db, String(username ?? "").trim());
  if (!u || !u.isActive) throw notFound("USER_NOT_FOUND", "Bu kullanıcı adında aktif bir yönetici yok.");
  if (!u.email || !isMailConfigured(ctx.db)) {
    throw badRequest(
      "EMAIL_REQUIRED",
      "Bu programda e-posta bağlı olmadığı için şifre e-postayla sıfırlanamaz. Kasa bilgisayarında 'Yönetici Şifresi Sıfırla'yı açın (Windows: Başlat menüsü → Market Kasa; Mac: market-pos klasörü).",
    );
  }
  return { email: u.email, userId: u.id, action: `${u.name} (${u.username}) için şifre sıfırlama` };
}

export const newPasswordSchema = z
  .object({ newPassword: passwordSchema, newPasswordConfirm: z.string() })
  .refine((d) => d.newPassword === d.newPasswordConfirm, { message: "Şifreler aynı değil.", path: ["newPasswordConfirm"] });

/** Şifremi unuttum 2. adım (kod doğrulandıktan sonra). */
export function applyForgotPassword(ctx: Ctx, row: VerificationRow, newPassword: string): User {
  const { nowIso } = stamp(ctx);
  const hash = hashSecret(newPassword);
  return ctx.db
    .transaction((): User => {
      const u = row.userId ? getUserById(ctx.db, row.userId) : undefined;
      if (!u || u.role !== "owner" || !u.isActive) throw notFound("USER_NOT_FOUND", "Hesap bulunamadı.");
      setUserSecret(ctx.db, u.id, "password", hash, nowIso);
      audit({ ...ctx, actor: { userId: u.id, name: u.name, role: "owner" } }, "user.secret", `${describe(u)}: şifre sıfırlandı (e-posta onaylı)`, {
        entityType: "user",
        entityId: u.id,
      });
      return getUserById(ctx.db, u.id)!;
    })
    .immediate();
}

/** E-posta ekleme/değiştirme 1. adım: kod YENİ adrese gider (adresin gerçekten size ait olduğu doğrulanır). */
export function prepareEmailChange(ctx: Ctx, input: unknown): { email: string; userId: number; action: string; payload: { email: string } } {
  const me = ctx.actor?.userId ? getUserById(ctx.db, ctx.actor.userId) : undefined;
  if (!me || me.role !== "owner") throw forbidden("FORBIDDEN", "Bu işlem için yetkiniz yok.");
  const email = parseInput(emailSchema, (input as { email?: unknown } | null)?.email);
  return { email, userId: me.id, action: `${me.name} (${me.username}) için e-posta adresini ${email} yapma`, payload: { email } };
}

export function applyEmailChange(ctx: Ctx, row: VerificationRow): User {
  if (row.userId !== ctx.actor?.userId) throw badRequest("CODE_INVALID", "Bu kod bu işlem için değil. Yeni kod isteyin.");
  const p = JSON.parse(row.payloadJson ?? "{}") as { email: string };
  const { nowIso } = stamp(ctx);
  return ctx.db
    .transaction((): User => {
      const u = getUserById(ctx.db, row.userId!)!;
      setUserEmail(ctx.db, u.id, p.email, nowIso);
      audit(ctx, "user.update", `${u.name}: e-posta ${u.email ?? "(yok)"} → ${p.email} (e-posta onaylı)`, { entityType: "user", entityId: u.id });
      return getUserById(ctx.db, u.id)!;
    })
    .immediate();
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

/** Kasiyer girişi: Kasiyer No + PIN. Başarısızsa null (kasiyer yoksa da aynı sürede yanıt). */
export function authenticateCashier(ctx: Ctx, cashierNo: string, pin: string): User | null {
  if (!/^\d{1,6}$/.test(cashierNo) || !/^\d{4,8}$/.test(pin)) {
    verifyDummy(pin);
    return null;
  }
  const c = findActiveCashierByNo(ctx.db, Number(cashierNo));
  if (!c) {
    verifyDummy(pin);
    return null;
  }
  return verifySecret(pin, c.pinHash) ? getUserById(ctx.db, c.id)! : null;
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
