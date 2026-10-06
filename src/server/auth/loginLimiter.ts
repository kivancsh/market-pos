/**
 * PIN deneme sınırı: art arda 5 hatalı denemeden sonra giriş 5 dakika kilitlenir.
 * Kilit tüm cihazlar için ortaktır (IP başlıkları ağda taklit edilebildiği için IP'ye göre ayrılmaz).
 * Başarılı giriş sayacı sıfırlar.
 */
export const MAX_FAILURES = 5;
export const LOCK_MS = 5 * 60_000;

interface State {
  failures: number;
  lockedUntil: number;
}

const g = globalThis as unknown as { __loginLimiter?: State };
const state = (): State => (g.__loginLimiter ??= { failures: 0, lockedUntil: 0 });

/** Kilitliyse kalan süreyi (ms) döndürür, değilse 0. */
export function lockRemainingMs(now: number): number {
  return Math.max(0, state().lockedUntil - now);
}

/** Hatalı denemeyi kaydeder; kilit devreye girdiyse true. */
export function recordFailure(now: number): { locked: boolean; remainingAttempts: number } {
  const s = state();
  s.failures += 1;
  if (s.failures >= MAX_FAILURES) {
    s.failures = 0;
    s.lockedUntil = now + LOCK_MS;
    return { locked: true, remainingAttempts: 0 };
  }
  return { locked: false, remainingAttempts: MAX_FAILURES - s.failures };
}

export function recordSuccess(): void {
  const s = state();
  s.failures = 0;
  s.lockedUntil = 0;
}

export function resetLimiterForTests(): void {
  g.__loginLimiter = { failures: 0, lockedUntil: 0 };
}
