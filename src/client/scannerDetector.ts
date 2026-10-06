/**
 * Barkod okuyucu algılayıcısı (DOM'dan bağımsız, test edilebilir).
 *
 * USB/Bluetooth okuyucular klavye gibi davranır: karakterleri çok hızlı yazar ve sonuna Enter basar.
 * Kural: ardışık karakterler arası süre ≤ maxIntervalMs, en az minLength karakter, Enter ile biter.
 * Çift tetikleme: bir okuma bittikten sonra dupWindowMs'den kısa sürede başlayan birebir aynı okuma yok sayılır.
 */
export interface ScannerConfig {
  maxIntervalMs: number;
  minLength: number;
  dupWindowMs: number;
}

export interface KeyInput {
  key: string;
  time: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type ScanDecision =
  | { type: "none" }
  | { type: "scan"; code: string }
  | { type: "duplicate"; code: string };

const IGNORED_KEYS = new Set(["Shift", "CapsLock", "Unidentified", "Dead"]);

export class ScannerDetector {
  private chars: string[] = [];
  private firstTime = 0;
  private lastTime = 0;
  private lastScan: { code: string; endTime: number } | null = null;

  constructor(private config: ScannerConfig) {}

  setConfig(config: ScannerConfig): void {
    this.config = config;
  }

  reset(): void {
    this.chars = [];
  }

  feed(k: KeyInput): ScanDecision {
    if (k.ctrlKey || k.metaKey || k.altKey) {
      this.reset();
      return { type: "none" };
    }
    if (k.key === "Enter") {
      const gapOk = this.chars.length > 0 && k.time - this.lastTime <= this.config.maxIntervalMs * 2;
      const isScan = gapOk && this.chars.length >= this.config.minLength;
      const code = this.chars.join("");
      const startTime = this.firstTime;
      this.reset();
      if (!isScan) return { type: "none" };
      const prev = this.lastScan;
      this.lastScan = { code, endTime: k.time };
      if (prev && prev.code === code && startTime - prev.endTime < this.config.dupWindowMs) {
        return { type: "duplicate", code };
      }
      return { type: "scan", code };
    }
    if (k.key.length === 1) {
      if (this.chars.length > 0 && k.time - this.lastTime > this.config.maxIntervalMs) this.reset();
      if (this.chars.length === 0) this.firstTime = k.time;
      this.chars.push(k.key);
      this.lastTime = k.time;
      return { type: "none" };
    }
    if (!IGNORED_KEYS.has(k.key)) this.reset();
    return { type: "none" };
  }
}
