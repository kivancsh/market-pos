"""Kullanım demosu için arka plan müziği + ekran olaylarına senkron ses efektleri (Python 3 + numpy).

Müzik videonun altında kalır: sıcak, pozitif, sakin ama canlı (112 BPM). Tekrara düşmemesi için her bölümün
(videodaki başlık) kendi akor yürüyüşü, arpej deseni ve davul yoğunluğu var; melodi her ölçüde yeniden üretilir.
Yapay zekâ bölümünde Do majörden Re majöre yükselir, kapanışta Optiva'nın 4 notalık sonik logosu çalar.
Ses efektleri record.mjs'in kaydettiği olaylardan gelir (sfx.json): tıklama, tuş, barkod bip'i, satış zili, yapay zekâ pırıltısı.

Kullanım: python3 promo/kullanim-demosu/music.py <sfx.json> <çıktı.wav>
"""

import json
import sys
import wave

import numpy as np

SR = 44100
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)

sfx = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
DUR = sfx["duration"]
N = int((DUR + 0.05) * SR)
L = np.zeros(N)
R = np.zeros(N)
VERB_L = np.zeros(N)
VERB_R = np.zeros(N)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t, gain=1.0, pan=0.0, send=0.0):
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i] * gain
    lg = np.cos((pan + 1) * np.pi / 4)
    rg = np.sin((pan + 1) * np.pi / 4)
    L[i : i + len(sig)] += sig * lg
    R[i : i + len(sig)] += sig * rg
    if send:
        VERB_L[i : i + len(sig)] += sig * lg * send
        VERB_R[i : i + len(sig)] += sig * rg * send


def env(n, a=0.005, d=0.2, s=0.0, r=0.05):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    dec = s + (1 - s) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4))
    e = np.where(t < a, e, dec)
    rl = int(r * SR)
    if rl and rl < n:
        e[-rl:] *= np.linspace(1, 0, rl)
    return e


def fft_lowpass(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / fc) ** 4)
    return np.fft.irfft(X, len(x))


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    ff = f * 2 ** (detune / 1200)
    out = np.zeros(n)
    for k in range(1, int(min(30, 16000 / ff)) + 1):
        out += np.sin(2 * np.pi * k * ff * t + rng.uniform(0, 6.28)) / k
    return out * 0.55


def pluck(f, dur, damp=0.996, bright=0.5):
    n = int(dur * SR)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    buf = buf * bright + np.convolve(buf, np.ones(3) / 3, "same") * (1 - bright)
    out = np.zeros(n)
    for i in range(n):
        v = buf[i % p]
        out[i] = v
        buf[i % p] = damp * 0.5 * (v + buf[(i + 1) % p])
    return out * env(n, 0.002, dur * 0.6, 0, 0.03)


def bell(f, dur=1.2, gain=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 6) + 0.18 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 9)
    return s * env(n, 0.003, dur * 0.35, 0, 0.05) * gain


def epiano(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 1.0 * t) * 1.6 * np.exp(-t * 3.5)
    s = np.sin(2 * np.pi * f * t + mod)
    return s * env(n, 0.004, 0.9, 0.25, 0.08)


def pad(tones, dur):
    n = int(dur * SR)
    s = np.zeros(n)
    for m in tones:
        for d in (-9, 0, 8):
            s += saw(midi(m), n, d)
    s = fft_lowpass(s, 1500)
    return s / (len(tones) * 3) * env(n, 0.45, 9, 1.0, 0.5)


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.9


def noise_hit(dur, fc, decay):
    n = int(dur * SR)
    x = rng.uniform(-1, 1, n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X *= 1 / (1 + (fc / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, n) * np.exp(-np.arange(n) / SR / decay)


def clap():
    s = noise_hit(0.25, 1200, 0.06)
    out = np.zeros(len(s) + 900)
    for k, g in ((0, 0.6), (300, 0.7), (650, 1.0)):
        out[k : k + len(s)] += s * g
    return out * 0.45


HAT = noise_hit(0.06, 8000, 0.012) * 0.5
SHAKER = noise_hit(0.08, 5000, 0.025) * 0.35
KICK = kick()
CLAP = clap()

# ------------------------------------------------------------------ bölümler (videodaki başlıklardan)
chapters = [e for e in sfx["events"] if e["type"] == "chapter"]
starts = [(0.0, "intro")]
seen = set()
for e in chapters:
    if e["n"] not in seen:
        seen.add(e["n"])
        starts.append((e["t"], e["n"]))
outro_t = next((e["t"] for e in sfx["events"] if e["type"] == "outro"), DUR - 3.5)
starts.append((outro_t, "outro"))


def q(t):
    """En yakın ölçü başına yuvarla (müzik bölümleri ölçüyle değişir)."""
    return round(t / BAR) * BAR


# Akor yürüyüşleri (derece; 0=I). Her bölüm farklı; art arda aynı yürüyüş yok.
PROGS = {
    "intro": [[0, 7], [5, 9]],
    "1": [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],  # I V vi IV
    "2": [[5, 9, 12], [7, 11, 14], [4, 7, 11], [9, 12, 16]],  # IV V iii vi
    "3": [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]],  # vi IV I V
    "4": [[0, 4, 7], [4, 7, 11], [5, 9, 12], [7, 11, 14]],  # I iii IV V
    "5": [[2, 5, 9], [7, 11, 14], [0, 4, 7], [9, 12, 16]],  # ii V I vi
    "6": [[5, 9, 12], [0, 4, 7], [7, 11, 14], [9, 12, 16]],  # IV I V vi
    "7": [[0, 4, 7], [9, 12, 16], [2, 5, 9], [7, 11, 14]],  # I vi ii V
    "8": [[9, 12, 16], [7, 11, 14], [5, 9, 12], [7, 11, 14]],  # vi V IV V
    "9": [[0, 4, 7], [7, 11, 14], [9, 12, 16], [4, 7, 11], [5, 9, 12], [0, 4, 7], [2, 5, 9], [7, 11, 14]],  # yükselen, uzun
    "10": [[5, 9, 12], [7, 11, 14], [0, 4, 7], [0, 4, 7]],
    "outro": [[5, 9, 12], [7, 11, 14], [0, 4, 7]],
}
# Arpej desenleri (akor tonlarının sırası, 8'lik)
ARPS = {
    "1": [0, 1, 2, 1, 0, 1, 2, 3],
    "2": [0, 2, 1, 2, 0, 2, 1, 3],
    "3": [2, 1, 0, 1, 2, 1, 0, 1],
    "4": [0, 1, 2, 3, 2, 1, 2, 3],
    "5": [0, 2, 3, 2, 1, 2, 3, 2],
    "6": [3, 2, 1, 0, 1, 2, 3, 2],
    "7": [0, 1, 0, 2, 0, 3, 0, 2],
    "8": [0, 2, 1, 3, 2, 1, 3, 2],
    "9": [0, 1, 2, 3, 4, 3, 2, 1],
    "10": [0, 1, 2, 1, 3, 2, 1, 2],
}
DRUMS = {"intro": 0, "1": 1, "2": 2, "3": 2, "4": 3, "5": 2, "6": 3, "7": 2, "8": 3, "9": 4, "10": 3, "outro": 0}
MELODY = {"2", "4", "6", "9", "10"}
MAJOR = [0, 2, 4, 5, 7, 9, 11]

sections = []
for i, (t, name) in enumerate(starts):
    a = 0.0 if i == 0 else q(t)
    b = q(starts[i + 1][0]) if i + 1 < len(starts) else DUR + BAR
    if b > a:
        sections.append((a, b, name))

root_c = 60  # Do
ai_start = next((a for a, b, n in sections if n == "9"), None)


def key_root(t):
    return root_c + (2 if ai_start is not None and t >= ai_start else 0)  # yapay zekâdan itibaren Re majör


for si, (a, b, name) in enumerate(sections):
    prog = PROGS[name]
    nb = max(1, int(round((b - a) / BAR)))
    bar_len = (b - a) / nb
    for k in range(nb):
        t0 = a + k * bar_len
        if t0 >= DUR:
            break
        ch = prog[k % len(prog)]
        kr = key_root(t0)
        tones = [kr + c for c in ch]
        # pad
        place(pad([x - 12 for x in tones] + [tones[0]], bar_len + 0.6), t0, 0.16 if name not in ("intro", "outro") else 0.22, 0, 0.5)
        if name in ("intro", "outro"):
            continue
        # bas: bölüme göre ritim
        bass_pat = [0, 1.5, 2, 3.5] if DRUMS[name] >= 3 else [0, 2, 2.75]
        for bt in bass_pat:
            n = int(BEAT * 0.9 * SR)
            f = midi(tones[0] - 24)
            tt = np.arange(n) / SR
            s = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt)) * env(n, 0.005, 0.35, 0.3, 0.05)
            place(s, t0 + bt * BEAT * bar_len / BAR, 0.25)
        # arpej (pluck)
        pat = ARPS[name]
        ext = tones + [tones[0] + 12, tones[1] + 12]
        for j, idx in enumerate(pat):
            m = ext[idx % len(ext)] + 12
            place(pluck(midi(m), 0.5, 0.995, 0.6), t0 + j * BEAT / 2 * bar_len / BAR, 0.12, -0.35 if j % 2 else 0.35, 0.35)
        # e-piyano vuruşları (2. ve 4. vuruşun sonu)
        if DRUMS[name] >= 2:
            for bt in (1.5, 3.5):
                for m in tones:
                    place(epiano(midi(m), 0.35), t0 + bt * BEAT, 0.05, 0.1, 0.3)
        # davul
        d = DRUMS[name]
        for beat in range(4):
            tb = t0 + beat * BEAT * bar_len / BAR
            if d >= 1 and (beat in (0, 2) or d >= 3):
                place(KICK, tb, 0.34 if d >= 3 else 0.26)
            if d >= 2 and beat in (1, 3):
                place(CLAP, tb, 0.24, 0, 0.25)
            for s16 in range(4):
                if d >= 1:
                    place(SHAKER if s16 % 2 else HAT, tb + s16 * BEAT / 4, (0.12 if s16 % 2 == 0 else 0.07) * (1.2 if d >= 4 else 1), 0.25)
        # melodi: her ölçü yeniden üretilir (tekrarsız), akor tonlarına iner
        if name in MELODY:
            r = np.random.default_rng(1000 + si * 97 + k)
            scale = [kr + 12 + s for s in MAJOR] + [kr + 24 + s for s in MAJOR[:4]]
            rhythms = [[0, 1, 1.5, 2.5, 3], [0, 0.75, 1.5, 3], [0.5, 1, 2, 2.5, 3.5], [0, 1.5, 2, 3], [0, 0.5, 1, 2, 3]]
            rh = rhythms[r.integers(len(rhythms))]
            pos = r.integers(2, 6)
            for j, bt in enumerate(rh):
                pos = int(np.clip(pos + r.choice([-2, -1, 1, 1, 2]), 0, len(scale) - 1))
                m = scale[pos]
                if j == len(rh) - 1:  # son nota akor tonu
                    m = min((x + 12 for x in tones), key=lambda x: abs(x - m))
                place(bell(midi(m), 0.9), t0 + bt * BEAT * bar_len / BAR, 0.075 if name != "9" else 0.09, 0.15, 0.55)

# yapay zekâ bölümüne geçişte yükselen pırıltı
if ai_start is not None:
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    rise = noise_hit(1.6, 3000, 10) * (t / 1.6) ** 2 * 0.2
    place(rise, ai_start - 1.6, 1.0, 0, 0.6)

# ------------------------------------------------------------------ sonik logo (açılış ve kapanış)
LOGO = [0, 4, 7, 12]  # Do–Mi–Sol–Do (majör)
for i, iv in enumerate(LOGO):
    place(bell(midi(72 + iv), 1.6), 0.35 + i * 0.22, 0.16, -0.3 + i * 0.2, 0.6)
ol = outro_t + 0.25
for i, iv in enumerate(LOGO):
    place(bell(midi(74 + iv), 2.4), ol + i * 0.24, 0.2, -0.3 + i * 0.2, 0.7)
place(pad([62 - 12, 66 - 12, 69 - 12, 74 - 12, 62], DUR - ol + 0.5), ol, 0.2, 0, 0.6)

# ------------------------------------------------------------------ ses efektleri (ekran olayları)
def tick():
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 2200 * t) * 0.5 + rng.uniform(-1, 1, n) * 0.3) * np.exp(-t * 260)


def keytap():
    return noise_hit(0.035, 2500, 0.008) * 0.6


def beep():
    n = int(0.11 * SR)
    t = np.arange(n) / SR
    return np.sign(np.sin(2 * np.pi * 2700 * t)) * 0.25 * env(n, 0.002, 1, 1, 0.01)


def chime():
    out = np.zeros(int(1.6 * SR))
    for i, iv in enumerate([0, 4, 7, 12]):
        b = bell(midi(84 + iv), 1.2)
        k = int(i * 0.07 * SR)
        out[k : k + len(b)] += b[: len(out) - k]
    return out


def whoosh():
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    s = noise_hit(0.7, 900, 10) * np.sin(np.pi * t / 0.7) ** 2
    return s * 0.5


for e in sfx["events"]:
    t = e["t"]
    k = e["type"]
    if k == "click":
        place(tick(), t + 0.09, 0.16)
    elif k == "key":
        place(keytap(), t, 0.07, rng.uniform(-0.2, 0.2))
    elif k == "scan":
        place(beep(), t + 0.05, 0.22)
    elif k == "success":
        place(chime(), t, 0.12, 0.1, 0.5)
    elif k == "magic":
        for i in range(10):
            place(bell(midi(88 + [0, 4, 7, 11, 12, 16, 19, 14, 12, 19][i]), 0.8), t + 0.2 + i * 0.07, 0.05, rng.uniform(-0.7, 0.7), 0.8)
    elif k == "whoosh":
        place(whoosh(), t - 0.25, 0.5, 0, 0.3)

# ------------------------------------------------------------------ yankı, son ses
def reverb(x, seconds=1.8, seed=3):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = r.uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 3.2)
    ir = fft_lowpass(ir, 5000)
    m = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
    return y / np.max(np.abs(ir)) * 0.02


L += reverb(VERB_L, seed=3)
R += reverb(VERB_R, seed=5)
mix = np.stack([L, R])
# yumuşak sınırlayıcı + açılış/kapanış
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
fi = int(0.25 * SR)
mix[:, :fi] *= np.linspace(0, 1, fi)
fo = int(1.8 * SR)
mix[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5
mix *= 0.89 / np.max(np.abs(mix))
pcm = (mix.T * 32767).astype(np.int16)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
rms = 20 * np.log10(np.sqrt(np.mean(mix**2)) + 1e-9)
print(f"✓ {OUT}: {DUR:.1f} sn, ortalama seviye {rms:.1f} dBFS, {len(sections)} bölüm")
