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

/**
 * Tarayıcılar sesi ilk kullanıcı etkileşiminden sonra açar. Ses motoru (AudioContext) burada, sayfa
 * açılırken boşta oluşturulur (askıda başlar); ilk tuş/tıklamada yalnızca hafif `resume()` çağrılır.
 * Oluşturmayı ilk tuşa bırakmak ~90 ms sürüp sonraki tuşları geciktiriyordu (okuyucunun ilk karakteri düşüyordu).
 */
export function unlockAudioOnFirstGesture(): () => void {
  if (typeof window === "undefined") return () => {};
  const prepare = window.setTimeout(() => {
    try {
      ctx ??= new AudioContext();
    } catch {
      // ses desteklenmiyor
    }
  }, 0);
  const unlock = () => {
    if (ctx && ctx.state === "suspended") void ctx.resume();
    if (ctx) remove();
  };
  const remove = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  return () => {
    window.clearTimeout(prepare);
    remove();
  };
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
