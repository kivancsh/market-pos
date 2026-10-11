"""
Tanıtım videosu müziği + ses efektleri (tamamen burada sentezlenir; telif yok).
128 BPM, La minör, vi–IV–I–V (Am F C G). Gerilimli giriş → 1. patlama (3,75 sn) → yükseliş →
2. patlama (31,875 sn) → final vuruşu (41,25 sn). Sahne ve efekt zamanları promo/timeline.json'dan.
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
SC_ = {s["id"]: (s["start"], s["end"]) for s in TL["scenes"]}
DROP1 = SC_["logo"][0]  # 3.75
BUILD = SC_["stock"][0]  # 28.125
DROP2 = SC_["montage"][0]  # 31.875
OUTRO = SC_["outro"][0]  # 37.5
FINAL = TL["sfx"]["finalHit"][0]  # 41.25
rng = np.random.default_rng(11)

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
    if i0 >= N or i0 < 0:
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


def onepole_sweep(x, f_start, f_end, curve=None):
    """Zamanla kesimi değişen 2 kademeli tek kutuplu alçak geçiren (filtre süpürmesi)."""
    n = len(x)
    fc = np.geomspace(f_start, f_end, n) if curve is None else curve
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty(n)
    for _ in range(2):
        s = 0.0
        for i in range(n):
            s = (1 - a[i]) * x[i] + a[i] * s
            y[i] = s
        x = y.copy()
    return y


def saw(freq, n, detune_cents=0.0, phase=0.0, kmax=40):
    f = freq * 2 ** (detune_cents / 1200)
    t = t_axis(n)
    k_max = max(1, min(kmax, int((SR / 2) / f)))
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


def beats(a, b, step=1.0):
    """[a, b) aralığındaki vuruş zamanları (step: vuruş cinsinden)."""
    out = []
    k = int(np.ceil(a / (BEAT * step) - 1e-9))
    while k * BEAT * step < b - 1e-9:
        out.append(k * BEAT * step)
        k += 1
    return out


# ----------------------------------------------------------------- akorlar
CHORDS = [  # (bas kök midi, akor sesleri)
    (33, [69, 72, 76]),  # Am
    (29, [65, 69, 72]),  # F
    (36, [67, 72, 76]),  # C
    (31, [67, 71, 74]),  # G
]


def chord_at(t):
    k = int((t - DROP1) // BAR) if t >= DROP1 else 0
    return CHORDS[k % 4]


# Kick'in çaldığı aralıklar (sidechain de buna göre)
def kick_on(t):
    if DROP1 <= t < BUILD:
        return True
    if BUILD <= t < DROP2 - 2 * BAR + BAR and abs((t / BEAT) % 2) < 1e-6:  # yükselişte yarım tempo
        return True
    if DROP2 <= t < OUTRO:
        return True
    if OUTRO <= t < FINAL and abs((t / BEAT) % 2) < 1e-6:
        return True
    return False


kicks = [t for t in beats(0, DUR) if kick_on(t)]

SC = np.ones(N)
for t in kicks:
    i0 = int(t * SR)
    n = min(int(0.32 * SR), N - i0)
    tt = t_axis(n)
    SC[i0 : i0 + n] = np.minimum(SC[i0 : i0 + n], 1 - 0.7 * np.exp(-tt / 0.085))


# ----------------------------------------------------------------- davul
def kick():
    n = int(0.42 * SR)
    t = t_axis(n)
    f = 46 + 130 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.26)
    click = lowpass(noise(n), 7000, 101) * np.exp(-t / 0.0025) * 0.7
    return np.tanh(1.9 * (body + click))


K = kick()
for t in kicks:
    place(K, t, 1.0)


def clap():
    n = int(0.35 * SR)
    t = t_axis(n)
    nz = highpass(lowpass(noise(n), 6000, 151), 1000, 151)
    e = np.zeros(n)
    for d in (0.0, 0.010, 0.021):
        e += np.where(t >= d, np.exp(-(t - d) / 0.011), 0) * 0.6
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.14), 0)
    return nz * e


def snare():
    n = int(0.25 * SR)
    t = t_axis(n)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04)
    nz = highpass(noise(n), 1500, 101) * np.exp(-t / 0.07)
    return 0.6 * tone + nz


C, SN = clap(), snare()
for t in beats(DROP1 + BEAT, BUILD, 2):  # 2 ve 4
    place(C, t, 0.5, pan=0.04, send=0.3)
for t in beats(DROP2 + BEAT, OUTRO, 2):
    place(C, t, 0.55, pan=0.04, send=0.3)
    place(SN, t, 0.18, send=0.2)


def hat(decay, hp=8000):
    n = int((decay * 6) * SR)
    t = t_axis(n)
    return highpass(noise(n), hp, 151) * np.exp(-t / decay)


HC, HO, HS = hat(0.03), hat(0.17), hat(0.016, 9500)
# giriş: saat tıkırtısı gibi 8'likler
for i, t in enumerate(beats(0, DROP1 - BEAT, 0.5)):
    place(HS, t, 0.05 + 0.08 * (t / DROP1), pan=0.3 if i % 2 else -0.3)
for t in beats(DROP1, BUILD) + beats(DROP2, OUTRO):
    place(HO, t + BEAT / 2, 0.2, pan=0.22)
    for q in (0.25, 0.75):
        place(HS, t + q * BEAT, 0.07 if t < DROP2 else 0.1, pan=-0.35)
for t in beats(SC_["finance"][0], BUILD):  # finansla birlikte 16'lık enerji
    place(HC, t, 0.08, pan=0.4)
for t in beats(OUTRO, FINAL, 0.5):
    place(HC, t, 0.07, pan=0.25)


# trampet yükselişi (8'lik → 16'lık → 32'lik), perde ve ses artarak
def roll(a, b, gain=0.32):
    t = a
    while t < b - 1e-6:
        p = (t - a) / (b - a)
        step = BEAT / 2 if p < 0.5 else BEAT / 4 if p < 0.8 else BEAT / 8
        n = int(0.15 * SR)
        tt = t_axis(n)
        f = 180 * (1 + p * 1.4)
        s = (np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.03) * 0.5 + highpass(noise(n), 1800, 101) * np.exp(-tt / 0.05))
        place(s, t, gain * (0.25 + 0.75 * p**1.3), pan=(p - 0.5) * 0.6, send=0.25)
        t += step


roll(BAR, DROP1 - BEAT / 4, 0.3)
roll(DROP2 - BAR, DROP2 - BEAT / 4, 0.36)
# finans → iş takibi geçişinde küçük dolgu
for i in range(4):
    place(SN, SC_["team"][0] - BEAT + i * BEAT / 4, 0.1 + 0.05 * i, pan=(-0.3 if i % 2 else 0.3), send=0.2)


# ----------------------------------------------------------------- bas (16'lık yuvarlanan + alt bas)
def bass_note(f, n):
    t = t_axis(n)
    s = lowpass(saw(f, n, kmax=24) * 0.8 + np.sin(2 * np.pi * f * t) * 0.7, 700, 151)
    return np.tanh(1.4 * s) * env(n, a=0.003, d=0.09, s=0.35, r=0.02, hold=n / SR - 0.02)


BASS_PAT = [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 2, 1]  # 0: kök (vuruşta susar), 1: kök oktav, 2: beşli
for sec in ((DROP1, BUILD), (DROP2, OUTRO)):
    for bt in beats(sec[0], sec[1], 0.25):
        idx = int(round((bt - sec[0]) / (BEAT / 4))) % 16
        if BASS_PAT[idx] == 0:
            continue
        root, _ = chord_at(bt)
        m = root + 12 + (7 if BASS_PAT[idx] == 2 else 0)
        n = int(BEAT / 4 * SR * 0.95)
        place(bass_note(midi(m), n), bt, 0.32)
# alt bas: her vuruşta derin sinüs (kick ile birlikte gövde)
for t in kicks:
    root, _ = chord_at(t)
    n = int(BEAT * SR)
    tt = t_axis(n)
    place(np.sin(2 * np.pi * midi(root) * tt) * env(n, a=0.02, d=0.25, s=0.6, r=0.05, hold=BEAT * 0.8), t + 0.03, 0.2)

# giriş: karanlık drone (La)
n = int(DROP1 * SR)
tt = t_axis(n)
drone = (np.sin(2 * np.pi * 55 * tt) + 0.5 * np.sin(2 * np.pi * 110.3 * tt)) * np.clip(tt / 1.2, 0, 1)
drone += 0.25 * lowpass(saw(55, n, 0) + saw(55, n, 9), 300, 201)
place(drone * (1 - np.clip((tt - (DROP1 - 0.2)) / 0.15, 0, 1)), 0, 0.22)

# ----------------------------------------------------------------- supersaw akor (pad + vurgular)
pad = np.zeros(N)
for k, t0 in enumerate(np.arange(0, DUR, BAR)):
    if t0 >= FINAL:
        break
    _, tones = chord_at(t0) if t0 >= DROP1 else CHORDS[0]
    n = int(BAR * SR) + int(0.3 * SR)
    sig = np.zeros(n)
    for m in tones + [tones[0] - 12]:
        for c in (-16, -7, 0, 8, 17):
            sig += saw(midi(m), n, c, phase=rng.uniform(0, 6.28), kmax=30)
    sig *= env(n, a=0.03, d=10, s=1, r=0.25, hold=BAR)
    i0 = int(t0 * SR)
    kk = min(n, N - i0)
    pad[i0 : i0 + kk] += sig[:kk]
pad /= np.abs(pad).max()
# filtre: giriş kapalı → açılır; yükselişte tekrar açılır
cut = np.full(N, 3200.0)
i1 = int(DROP1 * SR)
cut[:i1] = np.geomspace(180, 1400, i1)
ib, id2 = int(BUILD * SR), int(DROP2 * SR)
cut[ib:id2] = np.geomspace(600, 6000, id2 - ib)
cut[id2 : int(OUTRO * SR)] = 4200
pad_f = onepole_sweep(pad, 0, 0, curve=cut)
pad_f *= SC
pad_gain = np.ones(N)
pad_gain[int((DROP2 - 0.1) * SR) : id2] = 0.15  # patlama öncesi nefes
pad_gain[int((DROP1 - 0.12) * SR) : i1] = 0.15
place(np.vstack([pad_f * pad_gain, np.roll(pad_f, int(0.012 * SR)) * pad_gain]), 0, 0.2, send=0.25)

# ----------------------------------------------------------------- pluck arp (16'lık) + ping-pong
arp = np.zeros((2, N))
pat = [0, 2, 1, 3, 2, 0, 3, 1]
for i, t in enumerate(beats(DROP1, FINAL, 0.25)):
    if BUILD <= t < DROP2 - BAR:
        continue
    _, tones = chord_at(t)
    notes = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24]
    m = notes[pat[i % len(pat)]]
    n = int(0.18 * SR)
    sig = lowpass(saw(midi(m), n, kmax=20) * 0.6 + np.sign(np.sin(2 * np.pi * midi(m) * t_axis(n))) * 0.25, 4200, 101)
    sig *= env(n, a=0.002, d=0.06, s=0.0, r=0.02)
    vel = 1.0 if i % 4 == 0 else 0.7
    i0 = int(t * SR)
    k = min(n, N - i0)
    for d, (gl, gr) in enumerate([(1, 1), (0.4, 0), (0, 0.28), (0.15, 0)]):
        j0 = i0 + int(d * 0.75 * BEAT * SR)
        kk = min(k, N - j0)
        if kk <= 0:
            continue
        arp[0, j0 : j0 + kk] += vel * gl * sig[:kk]
        arp[1, j0 : j0 + kk] += vel * gr * sig[:kk]
arp *= SC
place(arp, 0, 0.15, send=0.2)

# ----------------------------------------------------------------- lead (akılda kalan 8'lik motif)
HOOK = {
    0: [76, None, 76, 74, 72, None, 69, None],
    1: [72, None, 72, 74, 76, None, 72, None],
    2: [79, None, 79, 76, 74, None, 72, None],
    3: [74, None, 74, 76, 71, None, 67, 71],
}


def lead_note(m, n, hold):
    tt = t_axis(n)
    f = midi(m)
    ph = 2 * np.pi * f * tt
    s = 0.5 * lowpass(saw(f, n, -9, kmax=30) + saw(f, n, 9, kmax=30), 5200, 101) + 0.35 * np.sin(ph) + 0.15 * np.sin(2 * ph)
    return s * env(n, a=0.004, d=0.16, s=0.35, r=0.06, hold=hold)


for sec, oct_, g in (((SC_["finance"][0], BUILD), 0, 0.12), ((DROP2, OUTRO), 12, 0.11), ((OUTRO, FINAL), 0, 0.07)):
    for bar_t in np.arange(sec[0], sec[1] - 1e-6, BAR):
        k = int(round((bar_t - DROP1) / BAR)) % 4
        for j, m in enumerate(HOOK[k]):
            if m is None:
                continue
            t = bar_t + j * BEAT / 2
            n = int(0.42 * SR)
            s = lead_note(m + oct_, n, BEAT / 2 * 0.9)
            place(s, t, g, pan=-0.12, send=0.35)
            place(s, t + 0.75 * BEAT, g * 0.3, pan=0.55, send=0.2)
            if oct_:
                place(lead_note(m, n, BEAT / 2 * 0.9), t, g * 0.5, pan=0.12, send=0.3)


# ----------------------------------------------------------------- yükselen ses (riser) + ters zil
def riser(length, f0=250, f1=9500):
    n = int(length * SR)
    t = t_axis(n)
    nz = onepole_sweep(noise(n), f0, f1)
    sweep = np.sin(2 * np.pi * np.cumsum(np.geomspace(150, 1600, n)) / SR) * 0.12
    return (nz + sweep) * (t / length) ** 2.4


place(riser(DROP1 - 0.6), 0.6, 0.36, send=0.3)
place(riser(DROP2 - BUILD - 0.6), BUILD + 0.5, 0.36, send=0.3)
place(riser(1.2), SC_["finance"][0] - 1.2, 0.15, send=0.2)
place(riser(1.2), OUTRO - 1.2, 0.18, send=0.2)


def crash(length=2.0):
    n = int(length * SR)
    t = t_axis(n)
    return highpass(noise(n), 4500, 151) * np.exp(-t / (length / 4))


for t in (DROP1, SC_["sale"][0], SC_["finance"][0], SC_["team"][0], DROP2, OUTRO):
    place(crash(), t, 0.22, pan=0.15, send=0.3)

# ----------------------------------------------------------------- efektler
def whoosh(length=0.6, peak=0.42):
    n = int(length * SR)
    t = t_axis(n)
    e = np.where(t < peak, (t / peak) ** 2.5, np.exp(-(t - peak) / 0.08))
    sig = onepole_sweep(noise(n), 500, 6000) * e
    pan = np.linspace(-0.9, 0.9, n)
    return np.vstack([sig * np.cos((pan + 1) * np.pi / 4), sig * np.sin((pan + 1) * np.pi / 4)]) * 1.4


W = whoosh()
for t in TL["sfx"]["whoosh"]:
    place(W, t - 0.42, 0.3, send=0.15)


def impact(length=1.8):
    n = int(length * SR)
    t = t_axis(n)
    f = 30 + 55 * np.exp(-t / 0.11)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)
    thump = lowpass(noise(n), 1000, 151) * np.exp(-t / 0.05)
    return np.tanh(1.5 * (boom + 0.5 * thump))


for t in TL["sfx"]["impact"]:
    place(impact(), t, 0.6, send=0.4)


def slam():
    n = int(0.5 * SR)
    t = t_axis(n)
    f = 70 + 120 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    hit = highpass(noise(n), 1200, 101) * np.exp(-t / 0.02)
    return np.tanh(1.6 * (body + 0.6 * hit))


for i, t in enumerate(TL["sfx"]["slam"]):
    place(slam(), t, 0.42 + 0.06 * i, send=0.35)


def strike():
    """Kalemle üstünü çizme + dijital bozulma."""
    n = int(0.28 * SR)
    t = t_axis(n)
    scratch = onepole_sweep(noise(n), 2500, 700) * np.exp(-t / 0.09)
    bit = np.sign(np.sin(2 * np.pi * np.cumsum(np.geomspace(900, 180, n)) / SR)) * np.exp(-t / 0.06) * 0.35
    return scratch + bit


for t in TL["sfx"]["strike"]:
    place(strike(), t, 0.3, pan=0.2, send=0.2)


def beep():
    n = int(0.11 * SR)
    t = t_axis(n)
    s = np.sin(2 * np.pi * 1975.5 * t) + 0.18 * np.sin(2 * np.pi * 3951 * t)
    return s * np.clip(t / 0.004, 0, 1) * np.clip((0.1 - t) / 0.008, 0, 1)


for t in TL["sfx"]["beep"]:
    place(beep(), t, 0.2, pan=0.2, send=0.12)


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
    place(click(), t, 0.34, pan=0.1)


def bell(f, length=1.2):
    n = int(length * SR)
    t = t_axis(n)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.15)) * np.exp(-t / 0.45)


for t in TL["sfx"]["chime"]:  # yazar kasa "çiling"
    for j, m in enumerate((88, 93, 97, 100)):
        place(bell(midi(m)), t + j * 0.06, 0.12, pan=(-0.3 + 0.2 * j), send=0.4)


def pop():
    n = int(0.12 * SR)
    t = t_axis(n)
    return np.sin(2 * np.pi * np.cumsum(np.geomspace(300, 1100, n)) / SR) * np.exp(-t / 0.035)


for i, t in enumerate(TL["sfx"]["pop"]):
    place(pop(), t, 0.24, pan=(-0.4 if i % 2 else 0.4), send=0.2)

# ---- final vuruşu: tüm akor + bum + zil, uzun kuyruk
for t in TL["sfx"]["finalHit"]:
    n = int(3.2 * SR)
    sig = np.zeros(n)
    for m in [45, 57, 64, 69, 72, 76, 81]:
        for c in (-14, 0, 13):
            sig += saw(midi(m), n, c, kmax=30)
    sig = lowpass(sig, 3600, 201) * env(n, a=0.004, d=1.1, s=0.0, r=0.1)
    sig /= np.abs(sig).max()
    place(sig, t, 0.34, send=0.6)
    place(impact(2.4), t, 0.6, send=0.45)
    place(crash(3.0), t, 0.14, send=0.4)
    place(bell(midi(81), 2.6), t, 0.13, send=0.6)
    place(bell(midi(88), 2.6), t + 0.05, 0.08, send=0.6)


# ----------------------------------------------------------------- reverb + master
def ir(seconds, seed):
    g = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = t_axis(n)
    h = g.standard_normal(n) * np.exp(-t / (seconds / 6.9)) * np.clip(t / 0.01, 0, 1)
    return lowpass(h, 6000, 101) * 0.08


L += fftconv(SEND[0], np.concatenate([np.zeros(int(0.02 * SR)), ir(2.0, 1)]))[:N]
R += fftconv(SEND[1], np.concatenate([np.zeros(int(0.023 * SR)), ir(2.0, 2)]))[:N]

mix = np.vstack([highpass(L, 26, 401), highpass(R, 26, 401)])
# master otomasyonu: sakin giriş, patlamalardan önce kısa nefes (sessizlik), sonra tam güç
TT = t_axis(N)
auto = np.ones(N)
auto = np.where(TT < DROP1, 0.42 + 0.4 * np.clip(TT / DROP1, 0, 1) ** 1.5, auto)
auto = np.where((TT >= BUILD) & (TT < DROP2), 0.7 + 0.25 * np.clip((TT - BUILD) / (DROP2 - BUILD), 0, 1) ** 1.5, auto)
for d in (DROP1, DROP2):
    auto = np.where((TT >= d - 0.16) & (TT < d), 0.04, auto)
mix *= np.convolve(auto, np.ones(64) / 64, mode="same")
fade = np.ones(N)
fi = int(0.02 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fo0 = int((DUR - 1.4) * SR)
fade[fo0:] = np.linspace(1, 0, N - fo0) ** 1.6
mix *= fade
mix /= np.abs(mix).max()
mix = np.tanh(1.8 * mix) / np.tanh(1.8) * 0.94

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
