/**
 * Giriş deneme sınırı: art arda 5 hatalı denemeden sonra o giriş türü 5 dakika kilitlenir.
 * Kasiyer (PIN) ve yönetici (şifre) sayaçları ayrıdır; biri diğerini kilitlemez.
 * Kilit tüm cihazlar için ortaktır (IP başlıkları ağda taklit edilebildiği için IP'ye göre ayrılmaz).
 */
export const MAX_FAILURES = 5;
export const LOCK_MS = 5 * 60_000;

export type LimiterKey = "cashier" | "owner";

interface State {
  failures: number;
  lockedUntil: number;
}

const g = globalThis as unknown as { __loginLimiter?: Partial<Record<LimiterKey, State>> };
const state = (key: LimiterKey): State => {
  g.__loginLimiter ??= {};
  return (g.__loginLimiter[key] ??= { failures: 0, lockedUntil: 0 });
};

/** Kilitliyse kalan süreyi (ms) döndürür, değilse 0. */
export function lockRemainingMs(key: LimiterKey, now: number): number {
  return Math.max(0, state(key).lockedUntil - now);
}

/** Hatalı denemeyi kaydeder; kilit devreye girdiyse locked=true. */
export function recordFailure(key: LimiterKey, now: number): { locked: boolean; remainingAttempts: number } {
  const s = state(key);
  s.failures += 1;
  if (s.failures >= MAX_FAILURES) {
    s.failures = 0;
    s.lockedUntil = now + LOCK_MS;
    return { locked: true, remainingAttempts: 0 };
  }
  return { locked: false, remainingAttempts: MAX_FAILURES - s.failures };
}

export function recordSuccess(key: LimiterKey): void {
  const s = state(key);
  s.failures = 0;
  s.lockedUntil = 0;
}

export function resetLimiterForTests(): void {
  g.__loginLimiter = {};
}
