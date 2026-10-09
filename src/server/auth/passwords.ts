import crypto from "node:crypto";

/**
 * Şifre / PIN saklama: scrypt (Node'un kendi kütüphanesi, ek paket yok), kullanıcı başına rastgele tuz.
 * Biçim: scrypt$N$r$p$tuz(base64)$özet(base64)
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(secret, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Zamanlama farkı oluşmasın diye kullanıcı bulunamadığında da aynı maliyette bir doğrulama yapılır. */
const DUMMY = hashSecret("yok-boyle-bir-kullanici");
export function verifyDummy(secret: string): void {
  verifySecret(secret, DUMMY);
}
