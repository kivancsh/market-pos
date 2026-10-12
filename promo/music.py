"""
Tanıtım videosu müziği + ses efektleri (tamamen burada sentezlenir; telif yok).

128 BPM (görüntü ölçülere senkron). Parlak ve pozitif: Re majör, yapay zekâ sahnesinden itibaren Mi majöre yükselir.
Tekrara düşmemek için her bölümün kendi akor yürüyüşü ve kendi çalgı rengi var; melodi her ölçüde yeniden üretilir:
  sorun (umutlu gerilim: si minör, kalp atışı) → logo (Re majör açılış) → satış (disko-funk: gitar, oktav bas, e-piyano) →
  finans (piyano-house akorları, tef, ana melodi) → ekip (yarım tempo, kayan 808, ping-pong arpej) → stok (piyano, büyük yükseliş) →
  yapay zekâ (Mi majör, nefesli vuruşları, koro, dijital pırıltı; en güçlü an) → karusel (yay koşuları) → bant durması →
  final (A–B–E: coşkulu çözülüş).
"Sonik logo": majör, yükselen 4 nota (Re–Fa♯–La–Re); logoda, satışta, barkod biplerinde, stokta, yapay zekâda ve finalde.
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


# ----------------------------------------------------------------- bölümler
DROP1 = SCN["logo"][0]
SALE = SCN["sale"][0]
FIN = SCN["finance"][0]
TEAM = SCN["team"][0]
STOCK = SCN["stock"][0]
AIS, AIE = SCN["ai"]
DROP2 = AIS  # 2. patlama = yapay zekâ asistanı (en güçlü an), karusel aynı enerjiyle sürer
MONT = SCN["montage"][0]
COLL = SCN["collapse"][0]
OUTRO = SCN["outro"][0]
FINAL = TL["sfx"]["finalHit"][0]
DRUMS_IN = DROP1 + BAR
rng = np.random.default_rng(31)

L = np.zeros(N)
R = np.zeros(N)
SEND = np.zeros((2, N))  # reverb gönderimi


# ----------------------------------------------------------------- akorlar: her bölümün kendi yürüyüşü (tek döngü yok)
# (bas, [orta ses akor notaları]) — Re majör; yapay zekâdan itibaren Mi majöre yükselir (modülasyon = "yükseliş" hissi)
C = {
    "D": (38, [62, 66, 69]), "Bm": (35, [59, 62, 66]), "G": (43, [59, 62, 67]), "A": (45, [61, 64, 69]),
    "Em": (40, [59, 64, 67]), "F#m": (42, [61, 66, 69]), "Bmaj": (47, [63, 66, 71]),
    "E": (40, [64, 68, 71]), "B": (47, [63, 66, 71]), "C#m": (37, [61, 64, 68]), "G#m": (44, [63, 68, 71]),
    "Asus": (45, [62, 64, 69]),
}
PROG = [  # (başlangıç, ölçü başına akorlar)
    (0.0, ["Bm", "Asus"]),
    (DROP1, ["D", "A"]),
    (SALE, ["G", "A", "F#m", "Bm"]),
    (FIN, ["D", "F#m", "G", "A"]),
    (TEAM, ["Em", "G", "A"]),
    (STOCK, ["G", "Bmaj"]),
    (AIS, ["E", "B", "C#m", "A"]),
    (MONT, ["A", "B", "G#m"]),
    (COLL, ["B"]),
    (OUTRO, ["A", "B", "E", "E"]),
]


def chord_at(t):
    cur = PROG[0]
    for p in PROG:
        if t + 1e-6 >= p[0]:
            cur = p
    k = int((t - cur[0] + 1e-6) // BAR)
    return C[cur[1][min(k, len(cur[1]) - 1)]]


def in_sec(t, a, b):
    return a <= t < b


# ----------------------------------------------------------------- davullar
FOUR = [(DRUMS_IN, TEAM), (AIS, COLL)]
HALF = [(TEAM, STOCK), (OUTRO, FINAL)]
kicks = []
for t in grid(0, DUR):
    b = round((t % BAR) / BEAT) % 4
    if any(in_sec(t, a, z) for a, z in FOUR):
        kicks.append(t)
    elif any(in_sec(t, a, z) for a, z in HALF) and b in (0, 2):
        kicks.append(t)
for a, z in HALF:
    kicks += [t + 1.5 * BEAT for t in grid(a, z, 4) if t + 1.5 * BEAT < z]
# stokta "nefes": kick yarım ölçülük aralarla yeniden toplanır (yükselişe hazırlık)
kicks += [t for t in grid(STOCK + BAR, AIS - BEAT / 2, 1)]
kicks = sorted(set(round(k, 6) for k in kicks))
SC = np.ones(N)
for t in kicks:
    i0 = int(t * SR)
    n = min(int(0.3 * SR), N - i0)
    SC[i0 : i0 + n] = np.minimum(SC[i0 : i0 + n], 1 - 0.7 * np.exp(-t_axis(n) / 0.08))


def kick():
    n = int(0.42 * SR)
    t = t_axis(n)
    f = 46 + 150 * np.exp(-t / 0.026)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    click = lowpass(noise(n), 7500, 101) * np.exp(-t / 0.0025) * 0.7
    return np.tanh(2.0 * (body + click))


K = kick()
for t in kicks:
    place(K, t, 1.0)


def clap():
    n = int(0.35 * SR)
    t = t_axis(n)
    nz = highpass(lowpass(noise(n), 7000, 151), 1100, 151)
    e = np.zeros(n)
    for d in (0.0, 0.009, 0.019):
        e += np.where(t >= d, np.exp(-(t - d) / 0.010), 0) * 0.6
    e += np.where(t >= 0.028, np.exp(-(t - 0.028) / 0.14), 0)
    return nz * e


def snare(f=200, body=0.6, decay=0.09):
    n = int(0.3 * SR)
    t = t_axis(n)
    return body * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.045) + highpass(noise(n), 1500, 101) * np.exp(-t / decay)


def hat(decay, hp=8000):
    n = int(decay * 6 * SR)
    return highpass(noise(n), hp, 151) * np.exp(-t_axis(n) / decay)


def shaker():
    n = int(0.09 * SR)
    t = t_axis(n)
    return highpass(noise(n), 6000, 101) * np.clip(t / 0.02, 0, 1) * np.exp(-t / 0.03)


def tamb():
    n = int(0.16 * SR)
    t = t_axis(n)
    jingle = sum(np.sin(2 * np.pi * f * t) for f in (5200, 6900, 8300)) * 0.1
    return (highpass(noise(n), 7000, 101) + jingle) * np.exp(-t / 0.05)


CL, SN, SNB = clap(), snare(), snare(170, 0.9, 0.16)
HC, HO, HS = hat(0.025), hat(0.16), hat(0.014, 9500)
SH, TB = shaker(), tamb()

# giriş: saat tıkırtısı + kalp atışı (gerilim ama umutlu)
for t in grid(0, DROP1 - BEAT, 0.5):
    place(HS, t, 0.04 + 0.06 * (t / DROP1), pan=0.3 if round(t / (BEAT / 2)) % 2 else -0.3)
for t in grid(0, DROP1 - BEAT, 2):
    n = int(0.3 * SR)
    tt = t_axis(n)
    hb = np.sin(2 * np.pi * np.cumsum(52 + 30 * np.exp(-tt / 0.03)) / SR) * np.exp(-tt / 0.12)
    place(hb, t, 0.42)
    place(hb, t + 0.2, 0.27)

for t in grid(DRUMS_IN, TEAM) + grid(AIS, COLL):
    b = round((t % BAR) / BEAT) % 4
    if b in (1, 3):
        place(CL, t, 0.5 if t < AIS else 0.56, send=0.28)
        if t >= FIN:
            place(SN, t, 0.15, send=0.2)
    place(HO, t + BEAT / 2, 0.15 if t < FIN else 0.19, pan=0.25)
    place(HS, t + BEAT / 4, 0.05, pan=-0.4)
    place(HS, t + 3 * BEAT / 4, 0.07, pan=-0.4)
# finansta tef, yapay zekâda tef + çalkalama (enerji katmanı)
for t in grid(FIN, TEAM, 0.25) + grid(AIS, COLL, 0.25):
    place(TB if round(t / (BEAT / 4)) % 2 else SH, t, 0.05 if t < AIS else 0.065, pan=0.45)
# satış: ara 16'lık açık-kapalı (disko hissi)
for t in grid(SALE, FIN, 0.25):
    if round(t / (BEAT / 4)) % 4 == 2:
        continue
    place(HC, t, 0.05, pan=0.4)
for a, z in HALF:
    for t in grid(a, z, 4):
        place(SNB, t + 2 * BEAT, 0.4, send=0.45)
        place(CL, t + 2 * BEAT, 0.28, send=0.3)
    for t in grid(a, z, 0.5):
        place(HC, t, 0.08, pan=0.25)


def tom(f):
    n = int(0.4 * SR)
    t = t_axis(n)
    ff = f * (1 + 0.6 * np.exp(-t / 0.04))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.18) + 0.2 * highpass(noise(n), 900, 101) * np.exp(-t / 0.03)


for i, f in enumerate([230, 200, 170, 150, 130, 115]):  # logo → davul girişi
    place(tom(f), DRUMS_IN - BEAT * 1.5 + i * BEAT / 4, 0.3, pan=0.5 - 0.2 * i, send=0.3)
for base in (FIN - BEAT, TEAM - BEAT, MONT - BEAT):  # bölüm geçişlerinde kısa dolgu (her biri farklı perde)
    for i, f in enumerate([210, 180, 150, 120] if base != MONT - BEAT else [260, 220, 190, 160]):
        place(tom(f), base + i * BEAT / 4, 0.2, pan=0.4 - 0.25 * i, send=0.15)


def roll(a, b, gain=0.32):
    t = a
    while t < b - 1e-6:
        p = (t - a) / (b - a)
        step = BEAT / 2 if p < 0.4 else BEAT / 4 if p < 0.75 else BEAT / 8
        n = int(0.15 * SR)
        tt = t_axis(n)
        s = np.sin(2 * np.pi * 190 * (1 + p * 1.6) * tt) * np.exp(-tt / 0.03) * 0.5 + highpass(noise(n), 1800, 101) * np.exp(-tt / 0.05)
        place(s, t, gain * (0.2 + 0.8 * p**1.4), pan=(p - 0.5) * 0.6, send=0.25)
        t += step


roll(BAR, DROP1 - BEAT / 4, 0.26)
roll(STOCK + 0.5 * BAR, AIS - BEAT / 4, 0.36)  # stok → yapay zekâ: büyük yükseliş


# ----------------------------------------------------------------- çalgılar
def supersaw(tones, n, voices=(-15, -6, 0, 7, 16)):
    sig = np.zeros(n)
    for m in tones:
        for c in voices:
            sig += saw(midi(m), n, c, phase=rng.uniform(0, 6.28), kmax=28)
    return sig


def piano(f, length=1.0):
    n = int(length * SR)
    t = t_axis(n)
    s = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (1.6 + k * 1.1)) / k**1.2 for k in range(1, 8))
    return s * np.clip(t / 0.003, 0, 1)


def epiano(f, n):
    t = t_axis(n)
    mod = np.sin(2 * np.pi * f * t) * 1.5 * np.exp(-t / 0.22)
    return (np.sin(2 * np.pi * f * t + mod) + np.sin(2 * np.pi * f * 7 * t) * np.exp(-t / 0.03) * 0.2) * env(n, a=0.003, d=0.4, s=0.2, r=0.06, hold=n / SR - 0.06)


def bell(f, length=1.4, bright=1.0):
    n = int(length * SR)
    t = t_axis(n)
    m1 = np.sin(2 * np.pi * f * 3.5 * t) * 2.0 * bright * np.exp(-t / 0.35)
    s = 0.65 * np.sin(2 * np.pi * f * t + m1) + 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.5)
    return s * np.exp(-t / (length / 3.2)) * np.clip(t / 0.002, 0, 1)


def pluck(f, dur, damp=0.994):
    """Karplus-Strong tel: funk gitar / pluck."""
    n = int(dur * SR)
    p = max(2, int(SR / f))
    buf = lowpass(rng.uniform(-1, 1, p + 202), 6000, 101)[101 : 101 + p].tolist()
    out = np.empty(n)
    j = 0
    for i in range(n):
        v = buf[j]
        out[i] = v
        nj = j + 1 if j + 1 < p else 0
        buf[j] = damp * 0.5 * (v + buf[nj])
        j = nj
    return out * np.clip((dur - t_axis(n)) / 0.01, 0, 1)


def brass(tones, dur):
    """Nefesli vuruşu: filtre zarfıyla açılan saw yığını (parlak, coşkulu)."""
    n = int(dur * SR)
    s = sum(saw(midi(m), n, c, kmax=24) for m in tones for c in (-8, 0, 9))
    cut = 600 + 4200 * np.exp(-t_axis(n) / 0.09)
    return onepole(s, cut) * env(n, a=0.006, d=0.25, s=0.5, r=0.05, hold=dur - 0.05)


def lead(m, dur, bright=5600):
    n = int((dur + 0.15) * SR)
    t = t_axis(n)
    f = midi(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.12) / 0.2, 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / SR
    raw = sum(np.sin(k * ph) / k * (1 if k % 2 else 0.6) for k in range(1, 18))
    s = 0.55 * lowpass(raw, bright, 101) + 0.35 * np.sin(ph) + 0.1 * np.sin(2 * ph)
    return s * env(n, a=0.006, d=0.18, s=0.45, r=0.08, hold=dur)


# --- bas: bölüme göre başka karakter
for t in grid(SALE, FIN, 0.5):  # satış: disko oktav bas (kök–oktav)
    root, _ = chord_at(t)
    up = round(t / (BEAT / 2)) % 2 == 1
    n = int(BEAT / 2 * SR * 0.85)
    tt = t_axis(n)
    f = midi(root + 12 + (12 if up else 0))
    s = np.tanh(1.6 * (onepole(saw(f, n, kmax=20), 2200 * np.exp(-tt / 0.06) + 200) + 0.5 * np.sin(2 * np.pi * f * tt)))
    place(s * env(n, a=0.002, d=0.1, s=0.3, r=0.02, hold=n / SR - 0.02), t, 0.3)
BASS16 = [0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 2, 1, 0, 1, 3, 1]  # 0 kök, 1 kök (yumuşak), 2 beşli, 3 oktav
for a, z in ((FIN, TEAM), (AIS, COLL)):  # finans + yapay zekâ + karusel: yuvarlanan 16'lık (her bölümde kayan kalıp)
    for i, t in enumerate(grid(a, z, 0.25)):
        k = BASS16[(i + (4 if a == AIS else 0)) % 16]
        if k == 0 and i % 4 == 0 and i % 16 not in (0, 8):
            continue
        root, _ = chord_at(t)
        m = root + 12 + {0: 0, 1: 0, 2: 7, 3: 12}[k]
        n = int(BEAT / 4 * SR * 0.95)
        tt = t_axis(n)
        s = lowpass(saw(midi(m), n, kmax=20) * 0.8 + np.sin(2 * np.pi * midi(m) * tt) * 0.7, 800, 151)
        place(np.tanh(1.4 * s) * env(n, a=0.003, d=0.08, s=0.35, r=0.02, hold=n / SR - 0.02), t, 0.3 if k != 1 else 0.24)
prev = None
for a, z in HALF:  # ekip + final: kayan 808
    for t in [k for k in kicks if a <= k < z]:
        root, _ = chord_at(t)
        f = midi(root + 12)
        n = int(1.3 * BEAT * SR)
        tt = t_axis(n)
        ff = np.full(n, f) if prev is None else f + (prev - f) * np.exp(-tt / 0.05)
        s = np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(ff) / SR)) * env(n, a=0.004, d=0.45, s=0.7, r=0.08, hold=n / SR - 0.08)
        place(s, t, 0.4)
        prev = f
for t in [k for k in kicks if any(in_sec(k, a, z) for a, z in FOUR)]:  # alt gövde
    root, _ = chord_at(t)
    n = int(BEAT * SR)
    place(np.sin(2 * np.pi * midi(root) * t_axis(n)) * env(n, a=0.02, d=0.25, s=0.55, r=0.05, hold=BEAT * 0.8), t + 0.03, 0.16)
n = int(DROP1 * SR)  # giriş: si üzerinde yumuşak drone
tt = t_axis(n)
place((np.sin(2 * np.pi * midi(35) * tt) + 0.4 * np.sin(2 * np.pi * midi(47) * tt)) * np.clip(tt / 1.2, 0, 1), 0, 0.16)

# --- akor yatakları
saw_bus = np.zeros(N)
cut = np.full(N, 300.0)
for a, z, c0, c1 in ((DROP1, SALE, 500, 5600), (FIN, TEAM, 3600, 4200), (STOCK, AIS, 700, 6500), (AIS, COLL, 5200, 5200), (OUTRO, DUR, 1600, 6200)):
    for t0 in np.arange(a, z - 1e-6, BAR):
        _, tones = chord_at(t0 + 0.01)
        ln = min(BAR, z - t0)
        nn = int(ln * SR) + int(0.25 * SR)
        sig = supersaw(tones + [tones[0] + 12], nn) * env(nn, a=0.02, d=10, s=1, r=0.2, hold=ln)
        i0 = int(t0 * SR)
        k = min(nn, N - i0)
        saw_bus[i0 : i0 + k] += sig[:k]
    ia, ib = int(a * SR), int(z * SR)
    cut[ia:ib] = np.geomspace(c0, c1, ib - ia)
saw_bus /= np.abs(saw_bus).max()
saw_f = onepole(saw_bus, cut) * np.where(np.arange(N) / SR < DRUMS_IN, 1.0, SC)
place(np.vstack([saw_f, np.roll(saw_f, int(0.012 * SR))]), 0, 0.17, send=0.28)

# satış: funk gitar (16'lık tıkız vuruşlar + akor çarpmaları)
FUNK = [1, 0, 2, 0, 1, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1, 1]  # 1 tık (susturulmuş), 2 akor
for i, t in enumerate(grid(SALE, FIN, 0.25)):
    k = FUNK[(i + 3 * (i // 16)) % 16]  # her ölçü kalıp kayar → tekrar etmez
    if not k:
        continue
    _, tones = chord_at(t)
    dur = 0.07 if k == 1 else 0.16
    s = sum(pluck(midi(m + 12), dur, 0.985 if k == 1 else 0.994) for m in (tones if k == 2 else tones[:1]))
    place(highpass(s, 300, 101), t, 0.16 if k == 2 else 0.1, pan=0.35, send=0.12)
# satış: elektrikli piyano senkopları
for t0 in np.arange(SALE, FIN - 1e-6, BAR):
    _, tones = chord_at(t0)
    for off in (0.75, 1.5, 2.75, 3.5):
        nn = int(0.4 * SR)
        place(sum(epiano(midi(m), nn) for m in tones) / 3, t0 + off * BEAT, 0.2, pan=-0.2, send=0.25)
# finans: piyano-house akorları (ara vuruşlarda, her ölçüde farklı ritim)
PH = [[0.5, 1.5, 2.5, 3.5], [0.5, 1.25, 2.5, 3.0, 3.75], [0.75, 1.5, 2.25, 3.5], [0.5, 1.0, 2.5, 3.25, 3.75]]
for bi, t0 in enumerate(np.arange(FIN, TEAM - 1e-6, BAR)):
    _, tones = chord_at(t0)
    for off in PH[bi % 4]:
        for m in tones + [tones[0] + 12]:
            place(piano(midi(m + 12), 0.5), t0 + off * BEAT, 0.07, pan=0.15, send=0.2)
# ekip + stok: ping-pong pluck arpejleri (yukarı-aşağı, ölçüye göre değişen sıra)
ARP = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 2, 3, 1, 2], [3, 2, 1, 0, 1, 2, 3, 2]]
for i, t in enumerate(grid(TEAM, AIS - BAR, 0.25)):
    _, tones = chord_at(t)
    notes = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24]
    m = notes[ARP[(i // 16) % 3][i % 8]]
    s = pluck(midi(m), 0.22, 0.996)
    place(s, t, 0.09 * (1.0 if i % 4 == 0 else 0.7), pan=0.6 if i % 2 else -0.6, send=0.25)
# stok: piyano akorları (nefes, umut)
for t0 in np.arange(STOCK, AIS - 1e-6, BAR / 2):
    _, tones = chord_at(t0)
    for m in tones:
        place(piano(midi(m), 1.6), t0, 0.09, send=0.4)
# yapay zekâ + karusel: nefesli vuruşları (senkoplu, coşkulu)
BR = [[0, 0.75, 1.5, 3.0], [0.5, 1.5, 2.25, 3.5], [0, 1.0, 1.75, 2.5, 3.5], [0.75, 1.5, 3.0, 3.75]]
for bi, t0 in enumerate(np.arange(AIS, COLL - 1e-6, BAR)):
    _, tones = chord_at(t0)
    for off in BR[bi % 4]:
        if t0 + off * BEAT >= COLL:
            continue
        place(brass([m + 12 for m in tones], 0.22), t0 + off * BEAT, 0.09, pan=-0.15, send=0.25)
# yapay zekâ: dijital pırıltı (32'lik, ping-pong)
for i, t in enumerate(grid(AIS + 2 * BEAT, MONT - BEAT / 2, 0.125)):
    _, tones = chord_at(t)
    m = [tones[0] + 24, tones[2] + 24, tones[1] + 24, tones[0] + 36][i % 4]
    nn = int(0.09 * SR)
    t_ = t_axis(nn)
    f = midi(m)
    place(np.sin(2 * np.pi * f * t_ + 1.2 * np.sin(2 * np.pi * f * 2 * t_) * np.exp(-t_ / 0.02)) * np.exp(-t_ / 0.03), t, 0.03 + 0.02 * (i % 8 == 0), pan=0.6 if i % 2 else -0.6, send=0.35)
# yapay zekâ + final: koro dokusu ("aa" ünlüsü: saw yığını üç formant bandından)
choir = np.zeros(N)
for a, z in ((AIS, MONT), (OUTRO, DUR)):
    for t0 in np.arange(a, z - 1e-6, BAR):
        _, tones = chord_at(t0 + 0.01)
        nn = int(BAR * SR) + int(0.5 * SR)
        sig = supersaw([m + 12 for m in tones], nn, voices=(-10, 0, 11)) * env(nn, a=0.3, d=10, s=1, r=0.4, hold=BAR)
        i0 = int(t0 * SR)
        k = min(nn, N - i0)
        choir[i0 : i0 + k] += sig[:k]
choir = sum(w * (lowpass(choir, f + bw, 301) - lowpass(choir, f - bw, 301)) for f, bw, w in ((720, 160, 1.0), (1180, 180, 0.6), (2600, 300, 0.3)))
choir /= max(1e-9, np.abs(choir).max())
place(np.vstack([choir, np.roll(choir, int(0.02 * SR))]), 0, 0.12, send=0.45)
# karusel: yay koşuları (yukarı doğru gamlar, her ölçü farklı başlangıç)
SCALE_E = [64, 66, 68, 69, 71, 73, 75, 76, 78, 80, 81, 83, 85, 87, 88]
for bi, t0 in enumerate(np.arange(MONT, COLL - 1e-6, BAR)):
    start = [0, 2, 4][bi % 3]
    for j, t in enumerate(grid(t0 + 2 * BEAT, min(t0 + BAR, COLL), 0.25)):
        m = SCALE_E[min(start + j, len(SCALE_E) - 1)] + 12
        nn = int(0.14 * SR)
        s = lowpass(sum(saw(midi(m), nn, c, kmax=16) for c in (-9, 0, 10)), 5000, 101) * env(nn, a=0.01, d=0.08, s=0.4, r=0.03)
        place(s, t, 0.03 + 0.004 * j, pan=-0.3 + 0.08 * j, send=0.3)

# ----------------------------------------------------------------- sonik logo (majör motif) + bölüm bölüm değişen melodi
MOTIF = [0, 4, 7, 12]  # Re–Fa♯–La–Re (neşeli, yükselen)


def motif(t0, root, step, gain, kind="bell", intervals=MOTIF, pan_spread=0.5, send=0.5, last_len=2.4):
    for j, iv in enumerate(intervals):
        f = midi(root + iv)
        ln = last_len if j == len(intervals) - 1 else 1.2
        s = bell(f, ln) if kind == "bell" else piano(f, ln) if kind == "piano" else bell(f, ln, 0.4)
        place(s, t0 + j * step, gain, pan=(j / 3 - 0.5) * pan_spread, send=send)


mt = TL["sfx"]["motif"]
motif(mt[0], 86, BEAT / 2, 0.06, kind="box", send=0.7)  # girişte fısıltı
motif(mt[1], 74, BEAT / 2, 0.2, send=0.5, last_len=3.0)  # logo: büyük
motif(mt[1], 62, BEAT / 2, 0.12, send=0.4, last_len=3.0)
motif(mt[2], 86, BEAT / 4, 0.13, send=0.45)  # satış tamamlandı: "çiling"
motif(mt[3], 74, BEAT / 2, 0.18, kind="piano", send=0.55, last_len=2.6)  # stok: piyano
motif(mt[4], 76, BEAT / 4, 0.17, send=0.5, last_len=2.6)  # yapay zekâ: Mi majörde "aha"
motif(mt[5], 76, BEAT / 2, 0.21, send=0.6, last_len=3.4)  # final: Mi majör
motif(mt[5], 64, BEAT / 2, 0.12, send=0.5, last_len=3.4)
for k in range(1, 4):
    motif(AIS + k * BAR, 88, BEAT / 4, 0.06, kind="box", pan_spread=0.9, send=0.45, last_len=1.2)

D_SCALE = [62, 64, 66, 67, 69, 71, 73]
E_SCALE = [64, 66, 68, 69, 71, 73, 75]
RHY = [  # ölçü içinde 16'lık konumlar (her ölçü farklı ritim seçer)
    [0, 3, 6, 8, 10, 12, 14],
    [0, 2, 4, 7, 10, 12],
    [2, 4, 6, 8, 11, 14],
    [0, 3, 4, 6, 8, 12, 15],
    [0, 4, 6, 7, 10, 12, 14],
    [1, 3, 6, 8, 9, 12, 14],
]


def scale_notes(scale, lo, hi):
    out = []
    for o in range(-2, 4):
        out += [m + 12 * o for m in scale]
    return sorted(m for m in out if lo <= m <= hi)


def melody(a, z, scale, lo, hi, gain, seed, bright=5600, octave_double=False):
    """Akor seslerine dayanan, ölçü ölçü değişen melodi (rastgele yürüyüş, güçlü vuruşta akor sesi, cümle sonunda çözülme)."""
    g = np.random.default_rng(seed)
    pool = scale_notes(scale, lo, hi)
    cur = pool[len(pool) // 2]
    bars = list(np.arange(a, z - 1e-6, BAR))
    for bi, t0 in enumerate(bars):
        _, tones = chord_at(t0 + 0.01)
        chord_pcs = {m % 12 for m in tones}
        pos = RHY[int(g.integers(len(RHY)))]
        if bi % 2 == 1:  # cevap ölçüsü: daha seyrek, sona doğru iner
            pos = [p for p in pos if p < 12] + [14]
        for j, p in enumerate(pos):
            t = t0 + p * BEAT / 4
            if t >= z:
                break
            strong = p % 4 == 0
            idx = pool.index(cur)
            step = int(g.choice([-2, -1, -1, 1, 1, 2, 3, -3])) if not strong else int(g.choice([-1, 1, 2, -2]))
            idx = int(np.clip(idx + step, 0, len(pool) - 1))
            if strong:  # güçlü vuruş: en yakın akor sesine çek
                cands = [m for m in pool if m % 12 in chord_pcs]
                cur = min(cands, key=lambda m: abs(m - pool[idx]))
            else:
                cur = pool[idx]
            nxt = pos[j + 1] if j + 1 < len(pos) else 16
            dur = max(0.09, (nxt - p) * BEAT / 4 * 0.85)
            last = bi == len(bars) - 1 and j == len(pos) - 1
            if last:  # cümle sonu: kök sesine çözül
                cur = min([m for m in pool if m % 12 == tones[0] % 12], key=lambda m: abs(m - cur))
                dur = BEAT * 1.2
            s = lead(cur, dur, bright)
            place(s, t, gain, pan=-0.1, send=0.3)
            place(s, t + 0.75 * BEAT, gain * 0.25, pan=0.55, send=0.15)  # yankı
            if octave_double:
                place(lead(cur - 12, dur, bright), t, gain * 0.45, pan=0.1, send=0.25)


melody(FIN, TEAM, D_SCALE, 72, 88, 0.1, 7)  # finans
melody(AIS + BAR, MONT, E_SCALE, 76, 92, 0.085, 19, bright=6400, octave_double=True)  # yapay zekâ (2. ölçüden)
melody(MONT, COLL, E_SCALE, 79, 95, 0.08, 23, bright=6800)  # karusel
melody(OUTRO + 0.5 * BAR, FINAL, E_SCALE, 71, 88, 0.08, 41)  # final girişi

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
for t in (DROP1, SALE, FIN, TEAM, DROP2, MONT, OUTRO):
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
    place(beep(86 + iv), t, 0.17, pan=0.2, send=0.15)


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

# final vuruşu: Mi majör akor + bum + zil
for t in TL["sfx"]["finalHit"]:
    n = int(3.4 * SR)
    sig = np.zeros(n)
    for m in [52, 64, 68, 71, 76, 80, 83]:
        for c in (-14, 0, 13):
            sig += saw(midi(m), n, c, kmax=30)
    sig = lowpass(sig, 3800, 201) * env(n, a=0.004, d=1.2, s=0.0, r=0.1)
    sig /= np.abs(sig).max()
    place(sig, t, 0.3, send=0.6)
    place(impact(2.4), t, 0.55, send=0.45)
    place(crash(3.0), t, 0.13, send=0.4)


def scan_sfx(length=1.3):
    """Tarama: yükselen dijital süpürme + basamaklı (bit) doku."""
    n = int(length * SR)
    tt = t_axis(n)
    f = np.geomspace(300, 2400, n)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR)
    steps = np.sign(np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR)) * 0.25
    e = np.clip(tt / 0.08, 0, 1) * np.clip((length - tt) / 0.15, 0, 1)
    return (lowpass(tone + steps, 5000, 101) + 0.15 * sweep_lp(noise(n), 800, 7000)) * e * 0.6


for t in TL["sfx"].get("scan", []):
    place(scan_sfx(), t, 0.16, pan=-0.2, send=0.2)

for t in TL["sfx"].get("type", []):  # daktilo: her aksiyonda hızlı tuş tıkırtıları
    for j in range(5):
        place(key_tap(), t + j * 0.075, 0.13 - 0.012 * j, pan=0.3 - 0.12 * j)

for t in TL["sfx"].get("chime", []):  # hedef: parlak majör zil
    for j, m in enumerate([83, 87, 90, 95]):
        place(bell(midi(m), 1.6, 0.7), t + j * 0.045, 0.07, pan=(j - 1.5) * 0.3, send=0.6)


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
