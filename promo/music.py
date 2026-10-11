"""
Tanıtım videosu müziği + ses efektleri (tamamen burada sentezlenir; telif yok).

128 BPM, La minör. Her bölümün kendi rengi var (tekdüze değil):
  sorun (gerilim, kalp atışı, müzik kutusu) → logo (sinematik açılış, davul yok → davul girer) →
  satış (zıplayan house grovu, elektrikli piyano) → finans (tam enerji, supersaw, ana melodi) →
  iş takibi (yarım tempo, derin 808 bas, arp) → stok (nefes, piyano, kalp atışı → yükseliş) →
  2. patlama (en güçlü) → bant durması → final (majöre çözülen mutlu son).
"Sonik logo": 4 notalık Market Kasa motifi (La–Mi–Do–La). Girişte fısıltı gibi, logoda büyük, satış
"çiling"inde, barkod biplerinde (motifin notalarına akortlu), ana melodinin her ölçüsünün başında,
stokta piyanoda ve finalde majör olarak duyulur — tekrar ettikçe akılda kalır.
Sahne ve efekt zamanları promo/timeline.json'dan.
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
SCN = {s["id"]: (s["start"], s["end"]) for s in TL["scenes"]}
DROP1 = SCN["logo"][0]
SALE = SCN["sale"][0]
FIN = SCN["finance"][0]
TEAM = SCN["team"][0]
STOCK = SCN["stock"][0]
DROP2 = SCN["montage"][0]
COLL = SCN["collapse"][0]
OUTRO = SCN["outro"][0]
FINAL = TL["sfx"]["finalHit"][0]
DRUMS_IN = DROP1 + BAR  # logo açılışı davulsuz, bir ölçü sonra davul girer
rng = np.random.default_rng(23)

L = np.zeros(N)
R = np.zeros(N)
SEND = np.zeros((2, N))  # reverb gönderimi


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_axis(n):
    return np.arange(n) / SR


def place(sig, start, gain=1.0, pan=0.0, send=0.0):
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


def onepole(x, fc_curve):
    """Zamanla kesimi değişen 2 kademeli tek kutuplu alçak geçiren."""
    a = np.exp(-2 * np.pi * np.broadcast_to(np.asarray(fc_curve, dtype=float), np.shape(x)) / SR)
    y = np.empty(len(x))
    for _ in range(2):
        s = 0.0
        for i in range(len(x)):
            s = (1 - a[i]) * x[i] + a[i] * s
            y[i] = s
        x = y.copy()
    return y


def sweep_lp(x, f0, f1):
    return onepole(x, np.geomspace(f0, f1, len(x)))


def saw(freq, n, detune_cents=0.0, phase=0.0, kmax=40):
    f = freq * 2 ** (detune_cents / 1200)
    t = t_axis(n)
    k_max = max(1, min(kmax, int((SR / 2) / f)))
    out = np.zeros(n)
    for k in range(1, k_max + 1):
        out += np.sin(2 * np.pi * k * f * t + k * phase) / k
    return out * (2 / np.pi)


def env(n, a=0.005, d=0.1, s=0.0, r=0.02, hold=None):
    t = t_axis(n)
    hold = hold if hold is not None else n / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    return e * (1 - rel)


def noise(n):
    return rng.uniform(-1, 1, n)


def grid(a, b, step=1.0):
    """[a, b) aralığında 'step' vuruşluk ızgara zamanları."""
    out, k = [], int(np.ceil(a / (BEAT * step) - 1e-9))
    while k * BEAT * step < b - 1e-9:
        out.append(k * BEAT * step)
        k += 1
    return out


def in_any(t, ranges):
    return any(a <= t < b for a, b in ranges)


# ----------------------------------------------------------------- akorlar (bölüme göre)
AM, F, C, G, EM = (33, [69, 72, 76]), (29, [65, 69, 72]), (36, [67, 72, 76]), (31, [67, 71, 74]), (28, [67, 71, 76])
CMAJ = (36, [64, 67, 72])


def chord_at(t):
    if t < DROP1:
        return AM
    if t >= FINAL:
        return CMAJ
    if OUTRO <= t:
        return [F, G][int((t - OUTRO) // BAR) % 2]
    if TEAM <= t < STOCK:
        return [F, G, EM][int((t - TEAM) // BAR) % 3]
    if STOCK <= t < DROP2:
        return [AM, F][int((t - STOCK) // BAR) % 2]
    base = DROP1 if t < STOCK else DROP2
    return [AM, F, C, G][int((t - base) // BAR) % 4]


# ----------------------------------------------------------------- davul kalıpları
FOUR = [(DRUMS_IN, TEAM), (DROP2, COLL)]  # dört vuruş
HALF = [(TEAM, STOCK), (OUTRO, FINAL)]  # yarım tempo
DRUM_GAPS = [(FIN + 2 * BAR - BEAT, FIN + 2 * BAR)]  # finans ortasında 1 vuruşluk boşluk (nefes)


def kick_times():
    out = []
    for t in grid(0, DUR):
        if in_any(t, DRUM_GAPS):
            continue
        b = round((t % BAR) / BEAT) % 4
        if in_any(t, FOUR):
            out.append(t)
        elif in_any(t, HALF) and b in (0, 2):
            out.append(t)
    for a, b in HALF:  # yarım tempoda senkoplu ek vuruş (2'nin "ve"si)
        out += [t + 1.5 * BEAT for t in grid(a, b, 4) if t + 1.5 * BEAT < b]
    return sorted(out)


kicks = kick_times()
SC = np.ones(N)
for t in kicks:
    i0 = int(t * SR)
    n = min(int(0.3 * SR), N - i0)
    SC[i0 : i0 + n] = np.minimum(SC[i0 : i0 + n], 1 - 0.72 * np.exp(-t_axis(n) / 0.08))


def kick(punch=1.0):
    n = int(0.45 * SR)
    t = t_axis(n)
    f = 44 + 140 * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    click = lowpass(noise(n), 7000, 101) * np.exp(-t / 0.0025) * 0.7 * punch
    return np.tanh(2.0 * (body + click))


K = kick()
for t in kicks:
    place(K, t, 1.0 if in_any(t, FOUR) else 1.1)


def clap():
    n = int(0.35 * SR)
    t = t_axis(n)
    nz = highpass(lowpass(noise(n), 6500, 151), 1000, 151)
    e = np.zeros(n)
    for d in (0.0, 0.010, 0.021):
        e += np.where(t >= d, np.exp(-(t - d) / 0.011), 0) * 0.6
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.15), 0)
    return nz * e


def snare(f=190, body=0.6, decay=0.08):
    n = int(0.3 * SR)
    t = t_axis(n)
    return body * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.045) + highpass(noise(n), 1500, 101) * np.exp(-t / decay)


CL, SN, SNB = clap(), snare(), snare(160, 0.9, 0.16)
for t in grid(DRUMS_IN, TEAM):
    if round((t % BAR) / BEAT) % 4 in (1, 3) and not in_any(t, DRUM_GAPS):
        place(CL, t, 0.5, send=0.3)
        if t >= FIN:
            place(SN, t, 0.16, send=0.2)
for t in grid(DROP2, COLL):
    if round((t % BAR) / BEAT) % 4 in (1, 3):
        place(CL, t, 0.56, send=0.3)
        place(SN, t, 0.2, send=0.2)
for a, b in HALF:  # yarım tempoda büyük trampet 3. vuruşta
    for t in grid(a, b, 4):
        place(SNB, t + 2 * BEAT, 0.42, send=0.5)
        place(CL, t + 2 * BEAT, 0.3, send=0.3)


def hat(decay, hp=8000):
    n = int((decay * 6) * SR)
    return highpass(noise(n), hp, 151) * np.exp(-t_axis(n) / decay)


HC, HO, HS = hat(0.028), hat(0.17), hat(0.015, 9500)
for t in grid(0, DROP1 - BEAT, 0.5):  # giriş: saat tıkırtısı
    place(HS, t, 0.04 + 0.07 * (t / DROP1), pan=0.3 if round(t / (BEAT / 2)) % 2 else -0.3)
for t in grid(DRUMS_IN, TEAM) + grid(DROP2, COLL):
    if in_any(t, DRUM_GAPS):
        continue
    place(HO if t >= FIN else HC, t + BEAT / 2, 0.18 if t >= FIN else 0.14, pan=0.22)
    for q in (0.25, 0.75):
        place(HS, t + q * BEAT, 0.07 if t < DROP2 else 0.1, pan=-0.35)
for t in grid(FIN, TEAM, 0.25) + grid(DROP2, COLL, 0.25):
    if not in_any(t, DRUM_GAPS):
        place(HC, t, 0.05, pan=0.45)
for a, b in HALF:
    for t in grid(a, b, 0.5):
        place(HC, t, 0.09, pan=0.25)
        if round(t / (BEAT / 2)) % 4 == 3:
            place(HO, t, 0.1, pan=-0.2)


def tom(f):
    n = int(0.4 * SR)
    t = t_axis(n)
    ff = f * (1 + 0.6 * np.exp(-t / 0.04))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.18) + 0.2 * highpass(noise(n), 900, 101) * np.exp(-t / 0.03)


# logo → davul girişi: tom dolgusu
for i, f in enumerate([220, 196, 165, 147, 130, 110]):
    place(tom(f), DRUMS_IN - BEAT * 1.5 + i * BEAT / 4, 0.3 + 0.04 * i, pan=0.5 - 0.2 * i, send=0.3)
# finans → iş takibi ve iş takibi → stok geçişleri: tom dolgusu
for base, g, snd in ((TEAM - BEAT, 0.28, 0.3), (STOCK - BEAT, 0.16, 0.08)):
    for i, f in enumerate([196, 165, 147, 110]):
        place(tom(f), base + i * BEAT / 4, g, pan=0.4 - 0.25 * i, send=snd)


def roll(a, b, gain=0.32):
    t = a
    while t < b - 1e-6:
        p = (t - a) / (b - a)
        step = BEAT / 2 if p < 0.45 else BEAT / 4 if p < 0.8 else BEAT / 8
        n = int(0.15 * SR)
        tt = t_axis(n)
        s = np.sin(2 * np.pi * 180 * (1 + p * 1.5) * tt) * np.exp(-tt / 0.03) * 0.5 + highpass(noise(n), 1800, 101) * np.exp(-tt / 0.05)
        place(s, t, gain * (0.2 + 0.8 * p**1.4), pan=(p - 0.5) * 0.6, send=0.25)
        t += step


roll(BAR, DROP1 - BEAT / 4, 0.28)
roll(DROP2 - BAR, DROP2 - BEAT / 4, 0.38)


def heart():
    """Kalp atışı ("lub-dub" iki vuruşun ilki)."""
    n = int(0.3 * SR)
    t = t_axis(n)
    return np.sin(2 * np.pi * np.cumsum(50 + 30 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.12)


for t in grid(0, DROP1 - BEAT, 2) + grid(STOCK, DROP2 - BAR, 2):
    g = 0.5 if t < DROP1 else 0.22
    place(heart(), t, g)
    place(heart(), t + 0.2, g * 0.64)


# ----------------------------------------------------------------- bas
def pluck_bass(f, n):
    t = t_axis(n)
    s = onepole(saw(f, n, kmax=24) * 0.9, 1800 * np.exp(-t / 0.05) + 180) + 0.5 * np.sin(2 * np.pi * f * t)
    return np.tanh(1.5 * s) * env(n, a=0.002, d=0.12, s=0.2, r=0.02, hold=n / SR - 0.02)


def roll_bass(f, n):
    t = t_axis(n)
    s = lowpass(saw(f, n, kmax=24) * 0.8 + np.sin(2 * np.pi * f * t) * 0.7, 750, 151)
    return np.tanh(1.4 * s) * env(n, a=0.003, d=0.09, s=0.35, r=0.02, hold=n / SR - 0.02)


def sub808(f, n, glide_from=None):
    t = t_axis(n)
    ff = np.full(n, f) if glide_from is None else f + (glide_from - f) * np.exp(-t / 0.06)
    s = np.sin(2 * np.pi * np.cumsum(ff) / SR)
    return np.tanh(1.8 * s) * env(n, a=0.004, d=0.5, s=0.75, r=0.08, hold=n / SR - 0.08)


# satış: zıplayan ara 8'likler (house)
for t in grid(SALE, FIN, 0.5):
    if round(t / (BEAT / 2)) % 2 == 1:
        root, _ = chord_at(t)
        place(pluck_bass(midi(root + 12), int(BEAT / 2 * SR * 0.9)), t, 0.36)
# finans ve 2. patlama: 16'lık yuvarlanan
PAT = [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 2, 1]
for a, b in ((FIN, TEAM), (DROP2, COLL)):
    for t in grid(a, b, 0.25):
        idx = int(round((t - a) / (BEAT / 4))) % 16
        if PAT[idx] == 0 or in_any(t, DRUM_GAPS):
            continue
        root, _ = chord_at(t)
        place(roll_bass(midi(root + 12 + (7 if PAT[idx] == 2 else 0)), int(BEAT / 4 * SR * 0.95)), t, 0.32)
# iş takibi ve final: derin 808 (kick ile birlikte, notalar arası kayarak)
prev = None
for a, b in HALF:
    for t in [k for k in kicks if a <= k < b]:
        root, _ = chord_at(t)
        f = midi(root + 12)
        place(sub808(f, int(1.4 * BEAT * SR), glide_from=prev), t, 0.42)
        prev = f
# alt bas: dört vuruşta kick'le gövde
for t in [k for k in kicks if in_any(k, FOUR)]:
    root, _ = chord_at(t)
    n = int(BEAT * SR)
    place(np.sin(2 * np.pi * midi(root) * t_axis(n)) * env(n, a=0.02, d=0.25, s=0.6, r=0.05, hold=BEAT * 0.8), t + 0.03, 0.18)

# giriş drone'u
n = int(DROP1 * SR)
tt = t_axis(n)
drone = (np.sin(2 * np.pi * 55 * tt) + 0.5 * np.sin(2 * np.pi * 110.4 * tt)) * np.clip(tt / 1.2, 0, 1)
drone += 0.22 * lowpass(saw(55, n) + saw(55, n, 9), 260, 201)
place(drone, 0, 0.2)


# ----------------------------------------------------------------- akor sesleri
def supersaw_chord(tones, n, voices=(-16, -7, 0, 8, 17)):
    sig = np.zeros(n)
    for m in tones + [tones[0] - 12]:
        for c in voices:
            sig += saw(midi(m), n, c, phase=rng.uniform(0, 6.28), kmax=30)
    return sig


# supersaw: logo açılışı (filtre açılarak), finans, 2. patlama, final
saw_bus = np.zeros(N)
cut = np.full(N, 200.0)
for a, b, c0, c1 in ((DROP1, SALE, 500, 5200), (FIN, TEAM, 3400, 3400), (DROP2, COLL, 4500, 4500), (OUTRO, FINAL, 1500, 6000)):
    for t0 in np.arange(a, b - 1e-6, BAR):
        _, tones = chord_at(t0 + 0.01)
        ln = min(BAR, b - t0)
        n = int(ln * SR) + int(0.25 * SR)
        sig = supersaw_chord(tones, n) * env(n, a=0.02, d=10, s=1, r=0.2, hold=ln)
        i0 = int(t0 * SR)
        k = min(n, N - i0)
        saw_bus[i0 : i0 + k] += sig[:k]
    ia, ib = int(a * SR), int(b * SR)
    cut[ia:ib] = np.geomspace(c0, c1, ib - ia)
saw_bus /= np.abs(saw_bus).max()
saw_f = onepole(saw_bus, cut)
saw_f *= np.where(np.arange(N) / SR < DRUMS_IN, 1.0, SC)  # logo açılışında pompalama yok
place(np.vstack([saw_f, np.roll(saw_f, int(0.012 * SR))]), 0, 0.2, send=0.28)


def epiano(f, n):
    """FM elektrikli piyano (sıcak, yumuşak)."""
    t = t_axis(n)
    mod = np.sin(2 * np.pi * f * t) * 1.6 * np.exp(-t / 0.25)
    car = np.sin(2 * np.pi * f * t + mod)
    tine = np.sin(2 * np.pi * f * 7 * t) * np.exp(-t / 0.03) * 0.2
    return (car + tine) * env(n, a=0.003, d=0.5, s=0.25, r=0.08, hold=n / SR - 0.08)


# satış: elektrikli piyano senkop vurgular
for t0 in np.arange(SALE, FIN - 1e-6, BAR):
    _, tones = chord_at(t0)
    for off in (1.5, 3.0, 3.5):
        n = int(0.45 * SR)
        place(sum(epiano(midi(m), n) for m in tones) / 3, t0 + off * BEAT, 0.26, pan=0.15, send=0.3)

# koyu pad: iş takibi ve stok
pad = np.zeros(N)
for t0 in np.arange(TEAM, DROP2 - 1e-6, BAR):
    _, tones = chord_at(t0 + 0.01)
    n = int(BAR * SR) + int(0.4 * SR)
    sig = supersaw_chord(tones, n, voices=(-9, 0, 9)) * env(n, a=0.25, d=10, s=1, r=0.35, hold=BAR)
    i0 = int(t0 * SR)
    k = min(n, N - i0)
    pad[i0 : i0 + k] += sig[:k]
ia, ib = int(TEAM * SR), int(DROP2 * SR)
pad[ia:ib] = lowpass(pad[ia:ib], 1100, 301)
pad /= max(1e-9, np.abs(pad).max())
_t = np.arange(N) / SR  # stokta geri çekil (nefes), yükselişte yeniden aç
pad *= np.interp(_t, [0, STOCK - 0.05, STOCK + 0.3, DROP2 - BAR, DROP2], [1.0, 1.0, 0.28, 0.28, 0.8])
place(np.vstack([pad, np.roll(pad, int(0.015 * SR))]), 0, 0.15, send=0.35)

# arp: iş takibi ve 2. patlama (16'lık pluck, ping-pong)
arp = np.zeros((2, N))
pat = [0, 2, 1, 3, 2, 0, 3, 1]
for i, t in enumerate(grid(TEAM, STOCK, 0.25) + grid(DROP2, COLL, 0.25)):
    _, tones = chord_at(t)
    notes = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24]
    m = notes[pat[i % len(pat)]]
    n = int(0.16 * SR)
    sig = lowpass(saw(midi(m), n, kmax=18) * 0.6 + np.sign(np.sin(2 * np.pi * midi(m) * t_axis(n))) * 0.22, 4200, 101)
    sig *= env(n, a=0.002, d=0.055, s=0.0, r=0.02)
    vel = 1.0 if i % 4 == 0 else 0.7
    i0 = int(t * SR)
    for d, (gl, gr) in enumerate([(1, 1), (0.4, 0), (0, 0.28), (0.15, 0)]):
        j0 = i0 + int(d * 0.75 * BEAT * SR)
        kk = min(n, N - j0)
        if kk > 0:
            arp[0, j0 : j0 + kk] += vel * gl * sig[:kk]
            arp[1, j0 : j0 + kk] += vel * gr * sig[:kk]
arp *= SC
place(arp, 0, 0.13, send=0.2)

# ----------------------------------------------------------------- sonik logo (motif) + ana melodi
MOTIF = [0, 7, 3, 12]  # La–Mi–Do–La (minör)
MOTIF_MAJ = [0, 7, 4, 12]  # finalde majör


def bell(f, length=1.4, bright=1.0):
    n = int(length * SR)
    t = t_axis(n)
    m1 = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * bright * np.exp(-t / 0.35)
    m2 = np.sin(2 * np.pi * f * 2.0 * t) * 1.2 * np.exp(-t / 0.6)
    s = 0.6 * np.sin(2 * np.pi * f * t + m1) + 0.4 * np.sin(2 * np.pi * f * t + m2)
    return s * np.exp(-t / (length / 3.2)) * np.clip(t / 0.002, 0, 1)


def piano(f, length=1.6):
    n = int(length * SR)
    t = t_axis(n)
    s = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (1.2 + k * 0.9)) / k**1.3 for k in range(1, 8))
    return s * np.clip(t / 0.003, 0, 1)


def motif(t0, root, step, gain, kind="bell", intervals=MOTIF, pan_spread=0.5, send=0.5, last_len=2.4):
    for j, iv in enumerate(intervals):
        f = midi(root + iv)
        ln = last_len if j == len(intervals) - 1 else 1.2
        s = bell(f, ln) if kind == "bell" else piano(f, ln) if kind == "piano" else bell(f, ln, 0.4)
        place(s, t0 + j * step, gain, pan=(j / 3 - 0.5) * pan_spread, send=send)


mt = TL["sfx"]["motif"]
motif(mt[0], 81, BEAT / 2, 0.06, kind="box", send=0.7)  # girişte fısıltı (müzik kutusu)
motif(mt[1], 69, BEAT / 2, 0.2, send=0.5, last_len=3.0)  # logo: büyük
motif(mt[1], 57, BEAT / 2, 0.12, send=0.4, last_len=3.0)
motif(mt[2], 81, BEAT / 4, 0.13, send=0.45)  # satış tamamlandı: "çiling"
motif(mt[3], 69, BEAT / 2, 0.2, kind="piano", send=0.55, last_len=3.0)  # stok: piyano
motif(mt[4], 72, BEAT / 2, 0.2, intervals=MOTIF_MAJ, send=0.6, last_len=3.4)  # final: majör
motif(mt[4], 60, BEAT / 2, 0.12, intervals=MOTIF_MAJ, send=0.5, last_len=3.4)

# ana melodi: her ölçü motifin şekliyle başlar
HOOK = {
    "Am": [69, None, 76, None, 72, None, 81, 79],
    "F": [77, None, 76, None, 72, None, 69, None],
    "C": [72, None, 79, None, 76, None, 84, 83],
    "G": [81, None, 79, None, 74, None, 71, None],
}


def lead_note(m, n, hold):
    tt = t_axis(n)
    f = midi(m)
    ph = 2 * np.pi * f * tt
    s = 0.5 * lowpass(saw(f, n, -9, kmax=30) + saw(f, n, 9, kmax=30), 5200, 101) + 0.35 * np.sin(ph) + 0.15 * np.sin(2 * ph)
    return s * env(n, a=0.004, d=0.16, s=0.35, r=0.06, hold=hold)


for (a, b), oct_, g in (((FIN, TEAM), 0, 0.11), ((DROP2, COLL), 12, 0.1)):
    for bar_t in np.arange(a, b - 1e-6, BAR):
        k = ["Am", "F", "C", "G"][int(round((bar_t - a) / BAR)) % 4]
        for j, m in enumerate(HOOK[k]):
            t = bar_t + j * BEAT / 2
            if m is None or t >= b or in_any(t, DRUM_GAPS):
                continue
            n = int(0.42 * SR)
            s = lead_note(m + oct_, n, BEAT / 2 * 0.9)
            place(s, t, g, pan=-0.12, send=0.35)
            place(s, t + 0.75 * BEAT, g * 0.3, pan=0.55, send=0.2)
            if oct_:
                place(lead_note(m, n, BEAT / 2 * 0.9), t, g * 0.5, pan=0.12, send=0.3)


# ----------------------------------------------------------------- geçiş sesleri (akışkanlık)
def riser(length, f0=250, f1=9500):
    n = int(length * SR)
    t = t_axis(n)
    nz = sweep_lp(noise(n), f0, f1)
    sw = np.sin(2 * np.pi * np.cumsum(np.geomspace(150, 1600, n)) / SR) * 0.12
    return (nz + sw) * (t / length) ** 2.4


def crash(length=2.0):
    n = int(length * SR)
    return highpass(noise(n), 4500, 151) * np.exp(-t_axis(n) / (length / 4))


def reverse_swell(length=0.75):
    """Ters zil: sahne geçişine 'emerek' götürür."""
    c = crash(length * 2.2)[::-1][-int(length * SR) :]
    return c * np.linspace(0.2, 1, len(c)) ** 2


place(riser(DROP1 - 0.6), 0.6, 0.34, send=0.3)
place(riser(DROP2 - STOCK - 1.2), STOCK + 1.2, 0.36, send=0.3)
for t in TL["transitions"]:
    place(reverse_swell(0.7), t - 0.7, 0.26, pan=0.1, send=0.05)
for t in (DROP1, SALE, FIN, TEAM, DROP2, OUTRO):
    place(crash(), t, 0.2, pan=0.15, send=0.3)


def whoosh(length=0.6, peak=0.42):
    n = int(length * SR)
    t = t_axis(n)
    e = np.where(t < peak, (t / peak) ** 2.5, np.exp(-(t - peak) / 0.08))
    sig = sweep_lp(noise(n), 500, 6000) * e
    pan = np.linspace(-0.9, 0.9, n)
    return np.vstack([sig * np.cos((pan + 1) * np.pi / 4), sig * np.sin((pan + 1) * np.pi / 4)]) * 1.4


W = whoosh()
for t in TL["sfx"]["whoosh"]:
    place(W, t - 0.42, 0.26, send=0.15)


def impact(length=1.8):
    n = int(length * SR)
    t = t_axis(n)
    boom = np.sin(2 * np.pi * np.cumsum(30 + 55 * np.exp(-t / 0.11)) / SR) * np.exp(-t / 0.6)
    thump = lowpass(noise(n), 1000, 151) * np.exp(-t / 0.05)
    return np.tanh(1.5 * (boom + 0.5 * thump))


for t in TL["sfx"]["impact"]:
    place(impact(), t, 0.62, send=0.4)


def slam():
    n = int(0.5 * SR)
    t = t_axis(n)
    body = np.sin(2 * np.pi * np.cumsum(70 + 120 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.16)
    return np.tanh(1.6 * (body + 0.6 * highpass(noise(n), 1200, 101) * np.exp(-t / 0.02)))


for i, t in enumerate(TL["sfx"]["slam"]):
    place(slam(), t, 0.4 + 0.06 * i, send=0.35)


def strike():
    n = int(0.28 * SR)
    t = t_axis(n)
    scratch = sweep_lp(noise(n), 2500, 700) * np.exp(-t / 0.09)
    bit = np.sign(np.sin(2 * np.pi * np.cumsum(np.geomspace(900, 180, n)) / SR)) * np.exp(-t / 0.06) * 0.35
    return scratch + bit


for t in TL["sfx"]["strike"]:
    place(strike(), t, 0.28, pan=0.2, send=0.2)


def beep(m):
    n = int(0.12 * SR)
    t = t_axis(n)
    f = midi(m)
    s = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t)
    return s * np.clip(t / 0.004, 0, 1) * np.clip((0.11 - t) / 0.01, 0, 1)


for t, iv in zip(TL["sfx"]["beep"], MOTIF):  # biplerin notaları = sonik logo
    place(beep(81 + iv), t, 0.17, pan=0.2, send=0.15)


def key_tap():
    n = int(0.06 * SR)
    t = t_axis(n)
    return highpass(noise(n), 2500, 101) * np.exp(-t / 0.004) * 0.8 + np.sin(2 * np.pi * 1250 * t) * np.exp(-t / 0.012) * 0.5


for t in TL["sfx"]["keyTap"]:
    place(key_tap(), t, 0.2, pan=-0.15)


def click():
    n = int(0.05 * SR)
    t = t_axis(n)
    return highpass(noise(n), 3000, 101) * np.exp(-t / 0.003) + np.sin(2 * np.pi * 2100 * t) * np.exp(-t / 0.006) * 0.4


for t in TL["sfx"]["click"]:
    place(click(), t, 0.32, pan=0.1)


def pop():
    n = int(0.12 * SR)
    t = t_axis(n)
    return np.sin(2 * np.pi * np.cumsum(np.geomspace(300, 1100, n)) / SR) * np.exp(-t / 0.035)


for i, t in enumerate(TL["sfx"]["pop"]):
    place(pop(), t, 0.2, pan=(-0.4 if i % 2 else 0.4), send=0.2)

# final vuruşu: Do majör akor + bum + zil
for t in TL["sfx"]["finalHit"]:
    n = int(3.4 * SR)
    sig = np.zeros(n)
    for m in [48, 60, 64, 67, 72, 76, 79]:
        for c in (-14, 0, 13):
            sig += saw(midi(m), n, c, kmax=30)
    sig = lowpass(sig, 3800, 201) * env(n, a=0.004, d=1.2, s=0.0, r=0.1)
    sig /= np.abs(sig).max()
    place(sig, t, 0.3, send=0.6)
    place(impact(2.4), t, 0.55, send=0.45)
    place(crash(3.0), t, 0.13, send=0.4)


# ----------------------------------------------------------------- reverb
def ir(seconds, seed):
    g = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = t_axis(n)
    h = g.standard_normal(n) * np.exp(-t / (seconds / 6.9)) * np.clip(t / 0.01, 0, 1)
    return lowpass(h, 6000, 101) * 0.08


L += fftconv(SEND[0], np.concatenate([np.zeros(int(0.02 * SR)), ir(2.2, 1)]))[:N]
R += fftconv(SEND[1], np.concatenate([np.zeros(int(0.023 * SR)), ir(2.2, 2)]))[:N]
mix = np.vstack([highpass(L, 26, 401), highpass(R, 26, 401)])

# ----------------------------------------------------------------- bant durması (montaj sonu): hız 1 → 0
a0 = int(TL["sfx"]["tapeStop"][0] * SR)
a1 = int((OUTRO - 0.14) * SR)
seg_n = a1 - a0
speed = (1 - np.linspace(0, 1, seg_n)) ** 1.6
pos = a0 + np.cumsum(speed)
for ch in range(2):
    src = mix[ch].copy()
    mix[ch, a0:a1] = np.interp(pos, np.arange(N), src) * np.linspace(1, 0.2, seg_n)
    mix[ch, a1 : int(OUTRO * SR)] = 0

# ----------------------------------------------------------------- master: bölümlere göre dinamik
TT = t_axis(N)
auto = np.ones(N)
for a, b, g0, g1 in (
    (0, DROP1, 0.4, 0.75),
    (DROP1, SALE, 1.0, 0.85),
    (SALE, FIN, 0.66, 0.72),
    (FIN, TEAM, 0.84, 0.9),
    (TEAM, STOCK, 0.8, 0.8),
    (STOCK, DROP2, 0.26, 0.95),
    (DROP2, OUTRO, 1.0, 1.0),
    (OUTRO, DUR, 0.95, 0.95),
):
    m = (TT >= a) & (TT < b)
    auto[m] = g0 + (g1 - g0) * ((TT[m] - a) / (b - a))
for d in (DROP1, DROP2):  # patlama öncesi nefes
    auto[(TT >= d - 0.15) & (TT < d)] = 0.03
auto = np.convolve(auto, np.ones(441) / 441, mode="same")
mix *= auto
fade = np.ones(N)
fade[: int(0.02 * SR)] = np.linspace(0, 1, int(0.02 * SR))
fo0 = int((DUR - 1.6) * SR)
fade[fo0:] = np.linspace(1, 0, N - fo0) ** 1.6
mix *= fade
# tepe yerine %99,9'luk seviyeye göre normalleştir: darbeler yumuşak kırpılır (daha vurucu), müzik öne çıkar
mix /= np.percentile(np.abs(mix), 99.9)
mix = np.tanh(0.9 * mix) / np.tanh(0.9 * 1.6) * 0.95
mix = np.clip(mix, -0.98, 0.98)

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
