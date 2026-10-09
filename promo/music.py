"""
Tanıtım videosu müziği + ses efektleri (tamamen burada sentezlenir; telif yok).
120 BPM, Re majör, I–V–vi–IV (D A Bm G). Sahne geçişleri ve efekt zamanları promo/timeline.json'dan.
Kullanım: python3 promo/music.py <çıktı.wav>
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
TL = json.loads((Path(__file__).parent / "timeline.json").read_text())
DUR = TL["duration"]
N = int(DUR * SR)
BEAT = 60 / TL["bpm"]
BAR = 4 * BEAT
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
SEND = np.zeros((2, N))  # reverb gönderimi


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_axis(n):
    return np.arange(n) / SR


def place(sig, start, gain=1.0, pan=0.0, send=0.0):
    """Mono ya da stereo sinyali zaman çizelgesine yerleştirir. pan: -1 sol, +1 sağ."""
    i0 = int(round(start * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        lg, rg = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sl, sr_ = sig * lg * np.sqrt(2), sig * rg * np.sqrt(2)
    else:
        sl, sr_ = sig[0], sig[1]
    n = min(len(sl), N - i0)
    L[i0 : i0 + n] += gain * sl[:n]
    R[i0 : i0 + n] += gain * sr_[:n]
    if send:
        SEND[0, i0 : i0 + n] += gain * send * sl[:n]
        SEND[1, i0 : i0 + n] += gain * send * sr_[:n]


def fftconv(x, h):
    n = len(x) + len(h) - 1
    nfft = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(h, nfft), nfft)[:n]
    o = (len(h) - 1) // 2
    return y[o : o + len(x)]


def sinc_lp(fc, taps=301):
    m = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * fc / SR * m) * np.blackman(taps)
    return h / h.sum()


def lowpass(x, fc, taps=301):
    return fftconv(x, sinc_lp(fc, taps))


def highpass(x, fc, taps=301):
    return x - lowpass(x, fc, taps)


def onepole_sweep(x, f_start, f_end):
    """Zamanla kesimi değişen 2 kademeli tek kutuplu alçak geçiren (filtre süpürmesi)."""
    n = len(x)
    fc = np.geomspace(f_start, f_end, n)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty(n)
    for _ in range(2):
        s = 0.0
        for i in range(n):
            s = (1 - a[i]) * x[i] + a[i] * s
            y[i] = s
        x = y.copy()
    return y


def saw(freq, n, detune_cents=0.0, phase=0.0):
    f = freq * 2 ** (detune_cents / 1200)
    t = t_axis(n)
    k_max = max(1, min(40, int((SR / 2) / f)))
    out = np.zeros(n)
    for k in range(1, k_max + 1):
        out += np.sin(2 * np.pi * k * f * t + k * phase) / k
    return out * (2 / np.pi)


def env(n, a=0.005, d=0.1, s=0.0, r=0.02, hold=None):
    """Basit ADSR. hold: notanın basılı kalma süresi (sn)."""
    t = t_axis(n)
    hold = hold if hold is not None else n / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    return e * (1 - rel)


def noise(n):
    return rng.uniform(-1, 1, n)


# ----------------------------------------------------------------- düzen
CHORDS = [  # (bas kök midi, akor sesleri)
    (38, [62, 66, 69]),  # D
    (33, [61, 64, 69]),  # A
    (35, [62, 66, 71]),  # Bm
    (31, [62, 67, 71]),  # G
]


def chord_at(t):
    return CHORDS[int(t // BAR) % 4]


kicks = []
for b in range(int(DUR / BEAT)):
    t = b * BEAT
    if 4 <= t < 33.5:
        kicks.append(t)
    elif 34 <= t < 38 and (b % 2 == 0):
        kicks.append(t)

# sidechain "pompalama" zarfı
SC = np.ones(N)
for t in kicks:
    i0 = int(t * SR)
    n = min(int(0.35 * SR), N - i0)
    tt = t_axis(n)
    SC[i0 : i0 + n] = np.minimum(SC[i0 : i0 + n], 1 - 0.65 * np.exp(-tt / 0.09) * np.clip(tt / 0.004, 0, 1) - 0.0)

# ---- kick
def kick():
    n = int(0.45 * SR)
    t = t_axis(n)
    f = 48 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.28)
    click = lowpass(noise(n), 6000, 101) * np.exp(-t / 0.003) * 0.6
    return np.tanh(1.6 * (body + click))


K = kick()
for t in kicks:
    place(K, t, 0.95)

# ---- clap (2 ve 4. vuruş) 8–33.5 ve fill
def clap():
    n = int(0.35 * SR)
    t = t_axis(n)
    nz = highpass(lowpass(noise(n), 5500, 151), 900, 151)
    e = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        e += np.where(t >= d, np.exp(-(t - d) / 0.012), 0) * 0.6
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.13), 0)
    return nz * e


C = clap()
for b in range(int(DUR / BEAT)):
    t = b * BEAT
    if 8 <= t < 33.5 and b % 4 in (1, 3) and not (25 <= t < 26):
        place(C, t, 0.42, pan=0.05, send=0.35)
# trampet fill 25–26 (16'lıklar, gittikçe güçlenen)
for i in range(8):
    place(C, 25 + i * BEAT / 4, 0.12 + 0.05 * i, pan=(-0.3 if i % 2 else 0.3), send=0.3)

# ---- hi-hat (ara 8'likler) + hafif 16'lık shaker
def hat(decay):
    n = int((decay * 6) * SR)
    t = t_axis(n)
    return highpass(noise(n), 7500, 151) * np.exp(-t / decay)


H_closed, H_open, H_shake = hat(0.035), hat(0.16), hat(0.018)
for b in range(int(DUR / BEAT)):
    t = b * BEAT
    if 4 <= t < 33.5:
        place(H_open if b % 4 == 3 and t >= 8 else H_closed, t + BEAT / 2, 0.2, pan=0.25)
    if 8 <= t < 33.5:
        for q in (0.25, 0.75):
            place(H_shake, t + q * BEAT, 0.06, pan=-0.35)
    if 34 <= t < 38:
        place(H_closed, t + BEAT / 2, 0.08, pan=0.25)

# ---- bas (ara 8'likler, house tarzı)
for b in range(int(DUR / BEAT)):
    t = b * BEAT
    if not (4 <= t < 33.5):
        continue
    root, _ = chord_at(t)
    f = midi(root + 12)
    n = int(0.26 * SR)
    sig = lowpass(saw(f, n) * 0.7 + np.sin(2 * np.pi * f / 2 * t_axis(n)) * 0.6, 520, 201)
    sig *= env(n, a=0.004, d=0.18, s=0.4, r=0.03, hold=0.2)
    place(sig, t + BEAT / 2, 0.42)

# ---- pad (supersaw, akor başına bir ölçü)
pad = np.zeros(N)
for bar in range(int(DUR / BAR)):
    t0 = bar * BAR
    if t0 >= 38:
        break
    _, tones = chord_at(t0)
    n = int(BAR * SR) + int(0.3 * SR)
    sig = np.zeros(n)
    for m in tones + [tones[0] - 12]:
        for c in (-14, -6, 0, 7, 15):
            sig += saw(midi(m), n, c, phase=rng.uniform(0, 6.28))
    sig *= env(n, a=0.08, d=10, s=1, r=0.25, hold=BAR)
    i0 = int(t0 * SR)
    k = min(n, N - i0)
    pad[i0 : i0 + k] += sig[:k]
pad /= np.abs(pad).max()
intro_n = int(4 * SR)
pad_f = lowpass(pad, 2600, 301)
pad_f[:intro_n] = onepole_sweep(pad[:intro_n], 250, 2600)
pad_f *= SC
pad_l = pad_f
pad_r = np.roll(pad_f, int(0.011 * SR))  # hafif genişlik
pad_gain = np.ones(N)
pad_gain[int(33.5 * SR) : int(34 * SR)] = np.linspace(1, 0.2, int(0.5 * SR))
place(np.vstack([pad_l * pad_gain, pad_r * pad_gain]), 0, 0.17, send=0.25)

# ---- arp (16'lık, oktav üstü) + ping-pong gecikme
arp = np.zeros((2, N))
pat = [0, 2, 1, 3, 2, 0, 3, 1]
step = BEAT / 4
for i in range(int(38 / step)):
    t = i * step
    _, tones = chord_at(t)
    notes = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24]
    m = notes[pat[i % len(pat)]]
    n = int(0.2 * SR)
    sig = lowpass(saw(midi(m), n) * 0.6 + np.sign(np.sin(2 * np.pi * midi(m) * t_axis(n))) * 0.25, 3800, 101)
    sig *= env(n, a=0.002, d=0.07, s=0.0, r=0.02)
    vel = 0.35 + 0.65 * min(1, t / 4) if t < 4 else (1.0 if i % 4 == 0 else 0.75)
    i0 = int(t * SR)
    k = min(n, N - i0)
    for d, (gl, gr) in enumerate([(1, 1), (0.42, 0), (0, 0.3), (0.18, 0), (0, 0.1)]):
        j0 = i0 + int(d * 0.375 * SR)
        kk = min(k, N - j0)
        if kk <= 0:
            continue
        arp[0, j0 : j0 + kk] += vel * gl * sig[:kk]
        arp[1, j0 : j0 + kk] += vel * gr * sig[:kk]
arp *= SC
place(arp, 0, 0.16, send=0.2)

# ---- melodi (12–33.5 ve 34–38)
MEL = {
    0: [(0, 78, 1.5), (1.5, 81, 1), (2.5, 78, 0.5), (3, 76, 1)],
    1: [(0, 76, 1.5), (1.5, 73, 1), (2.5, 76, 0.5), (3, 73, 1)],
    2: [(0, 74, 1.5), (1.5, 78, 1), (2.5, 74, 0.5), (3, 71, 1)],
    3: [(0, 74, 1.5), (1.5, 71, 1), (2.5, 74, 0.5), (3, 79, 1)],
}
for bar in range(int(DUR / BAR)):
    t0 = bar * BAR
    if not (12 <= t0 < 33.5 or 34 <= t0 < 38):
        continue
    for beat, m, ln in MEL[bar % 4]:
        t = t0 + beat * BEAT
        n = int((ln * BEAT + 0.15) * SR)
        tt = t_axis(n)
        f = midi(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * tt) * np.clip((tt - 0.15) / 0.2, 0, 1))
        ph = 2 * np.pi * np.cumsum(f) / SR
        sig = 0.55 * np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph) + 0.25 * lowpass(saw(midi(m), n), 2400, 101)
        sig *= env(n, a=0.008, d=0.25, s=0.55, r=0.1, hold=ln * BEAT - 0.03)
        g = 0.13 if t0 < 34 else 0.09
        place(sig, t, g, pan=-0.1, send=0.35)
        place(sig, t + 0.375, g * 0.3, pan=0.6, send=0.2)

# ---- yükselen ses (riser) 2–4 ve 24.5–26
def riser(length):
    n = int(length * SR)
    t = t_axis(n)
    nz = onepole_sweep(noise(n), 300, 9000)
    sweep = np.sin(2 * np.pi * np.cumsum(np.geomspace(200, 1400, n)) / SR) * 0.15
    return (nz + sweep) * (t / length) ** 2.2


place(riser(2.0), 2.0, 0.32, send=0.3)
place(riser(1.5), 24.5, 0.22, send=0.3)

# ---- crash zili
def crash(length=1.8):
    n = int(length * SR)
    t = t_axis(n)
    return highpass(noise(n), 4500, 151) * np.exp(-t / (length / 4))


for t in (4, 26, 34):
    place(crash(), t, 0.22, pan=0.15, send=0.3)

# ----------------------------------------------------------------- efektler
def whoosh(length=0.7, peak=0.45):
    n = int(length * SR)
    t = t_axis(n)
    e = np.where(t < peak, (t / peak) ** 2.5, np.exp(-(t - peak) / 0.09))
    nz = onepole_sweep(noise(n), 400, 5000)
    sig = nz * e
    pan = np.linspace(-0.9, 0.9, n)
    return np.vstack([sig * np.cos((pan + 1) * np.pi / 4), sig * np.sin((pan + 1) * np.pi / 4)]) * 1.4


W = whoosh()
for t in TL["sfx"]["whoosh"]:
    place(W, t - 0.45, 0.33, send=0.15)


def impact():
    n = int(1.6 * SR)
    t = t_axis(n)
    f = 32 + 45 * np.exp(-t / 0.12)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    thump = lowpass(noise(n), 900, 151) * np.exp(-t / 0.05)
    return np.tanh(1.3 * (boom + 0.5 * thump))


for t in TL["sfx"]["impact"]:
    place(impact(), t, 0.55, send=0.4)


def beep():
    n = int(0.11 * SR)
    t = t_axis(n)
    s = np.sin(2 * np.pi * 1975.5 * t) + 0.18 * np.sin(2 * np.pi * 3951 * t)
    return s * np.clip(t / 0.004, 0, 1) * np.clip((0.1 - t) / 0.008, 0, 1)


for t in TL["sfx"]["beep"]:
    place(beep(), t, 0.16, pan=0.2, send=0.1)


def key_tap():
    n = int(0.06 * SR)
    t = t_axis(n)
    return highpass(noise(n), 2500, 101) * np.exp(-t / 0.004) * 0.8 + np.sin(2 * np.pi * 1250 * t) * np.exp(-t / 0.012) * 0.5


for t in TL["sfx"]["keyTap"]:
    place(key_tap(), t, 0.22, pan=-0.15)


def click():
    n = int(0.05 * SR)
    t = t_axis(n)
    return highpass(noise(n), 3000, 101) * np.exp(-t / 0.003) + np.sin(2 * np.pi * 2100 * t) * np.exp(-t / 0.006) * 0.4


for t in TL["sfx"]["click"]:
    place(click(), t, 0.3, pan=0.1)


def bell(f, length=1.2):
    n = int(length * SR)
    t = t_axis(n)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.15)) * np.exp(-t / 0.45)


for t in TL["sfx"]["chime"]:
    place(bell(midi(88)), t, 0.14, pan=-0.2, send=0.4)
    place(bell(midi(95)), t + 0.09, 0.12, pan=0.2, send=0.4)
    place(bell(midi(100)), t + 0.18, 0.09, pan=0.0, send=0.4)


def pop():
    n = int(0.12 * SR)
    t = t_axis(n)
    return np.sin(2 * np.pi * np.cumsum(np.geomspace(260, 900, n)) / SR) * np.exp(-t / 0.035)


for t in TL["sfx"]["pop"]:
    place(pop(), t, 0.25, pan=0.4, send=0.2)

# ---- final vuruşu: tüm akor + bum + zil, uzun kuyruk
for t in TL["sfx"]["finalHit"]:
    n = int(2.0 * SR)
    sig = np.zeros(n)
    for m in [50, 62, 66, 69, 74, 78]:
        for c in (-12, 0, 11):
            sig += saw(midi(m), n, c)
    sig = lowpass(sig, 3200, 201) * env(n, a=0.005, d=0.7, s=0.0, r=0.1)
    sig /= np.abs(sig).max()
    place(sig, t, 0.32, send=0.6)
    place(impact(), t, 0.5, send=0.4)
    place(crash(2.0), t, 0.11, send=0.4)
    place(bell(midi(86), 1.8), t, 0.12, send=0.5)

# ----------------------------------------------------------------- reverb + master
def ir(seconds, seed):
    g = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = t_axis(n)
    h = g.standard_normal(n) * np.exp(-t / (seconds / 6.9)) * np.clip(t / 0.01, 0, 1)
    return lowpass(h, 6000, 101) * 0.08


L += fftconv(np.concatenate([SEND[0], np.zeros(0)]), np.concatenate([np.zeros(int(0.02 * SR)), ir(1.8, 1)]))[:N] * 1.0
R += fftconv(SEND[1], np.concatenate([np.zeros(int(0.023 * SR)), ir(1.8, 2)]))[:N] * 1.0

mix = np.vstack([L, R])
mix = highpass(mix[0], 28, 401), highpass(mix[1], 28, 401)
mix = np.vstack(mix)
# girişte yumuşak başlangıç, sonda sönümleme
fade = np.ones(N)
fi = int(0.03 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fo0 = int(38.6 * SR)
fade[fo0:] = np.linspace(1, 0, N - fo0) ** 1.5
mix *= fade
mix /= np.abs(mix).max()
mix = np.tanh(1.5 * mix) / np.tanh(1.5) * 0.93

rms = np.sqrt(np.mean(mix**2))
print(f"peak={np.abs(mix).max():.3f} rms={rms:.3f} ({20*np.log10(rms):.1f} dBFS)")

out = sys.argv[1] if len(sys.argv) > 1 else "promo/music.wav"
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("✓", out)
