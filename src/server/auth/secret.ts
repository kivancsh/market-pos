import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PLACEHOLDER_PREFIX = "bu-metni";
let cached: string | null = null;

/**
 * Oturum çerezini şifreleyen gizli anahtar.
 * .env'deki SESSION_SECRET (en az 32 karakter) kullanılır; yoksa veya .env.example'daki örnek metin
 * bırakıldıysa data/session-secret dosyasında rastgele bir anahtar üretilip saklanır.
 */
export function getSessionSecret(): string {
  if (cached) return cached;
  const env = process.env.SESSION_SECRET?.trim();
  if (env && env.length >= 32 && !env.startsWith(PLACEHOLDER_PREFIX)) {
    cached = env;
    return env;
  }
  const file = path.join(process.cwd(), "data", "session-secret");
  try {
    const s = fs.readFileSync(file, "utf8").trim();
    if (s.length >= 32) {
      cached = s;
      return s;
    }
  } catch {
    // dosya yok: aşağıda üretilecek
  }
  const s = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s, { mode: 0o600 });
  cached = s;
  return s;
}
