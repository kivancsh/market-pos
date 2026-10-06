/** Dosya gerektirmeyen bip sesleri (Web Audio API). */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Tarayıcılar sesi ilk kullanıcı etkileşiminden sonra açar; bunu sayfa açılışında çağırın. */
export function unlockAudioOnFirstGesture(): void {
  if (typeof window === "undefined") return;
  const unlock = () => {
    audio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType, volume: number) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = a.currentTime + startOffset;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function beepSuccess(): void {
  tone(1400, 0, 0.09, "sine", 0.25);
}

export function beepError(): void {
  tone(220, 0, 0.18, "square", 0.15);
  tone(180, 0.22, 0.25, "square", 0.15);
}
