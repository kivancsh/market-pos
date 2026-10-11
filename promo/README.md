# Tanıtım videosu

Hazır video: [`market-kasa-tanitim.mp4`](market-kasa-tanitim.mp4) — 45 sn, 1920×1080, 30 fps, H.264 + AAC stereo.

Akış (128 BPM müziğe kare kare senkron; sahneler kesintisiz kamera hareketiyle birbirine bağlanır): **sorun** ("Dükkânınızda hâlâ…
VERİMSİZ SATIŞ, DAĞINIK EKİP YÖNETİMİ, PLANSIZ BÜYÜME" üstü çizilir → "Artık değil.") → **1. patlama** logo → **Satış** (barkod okutma, sayaçla
toplam, F8, para üstü, konfeti) → **Finans yönetimi** (Genel bakış, ciro / brüt kâr / gider / net kâr kartları; "Net kâr" kartı
kâr-zarar denklemine uçar, KDV özeti) → **İş takibi** (kasiyer performansı, yoğun saatler ısı haritası) → **Stok** (bitmeden haber,
sipariş önerisi) → **2. patlama** "Ve dahası" 3B karusel: etiket, Excel, telefon, gün sonu e-postası, işlem geçmişi → kartlar
merkezde toplanıp logoya patlar → **final** (Satış · Stok · Finans · Ekip, "Dükkânınızı bugün büyütün.").

Müzik: her bölümün kendi rengi var (gerilim → sinematik açılış → house grovu → tam enerji → yarım tempo 808 → nefes → patlama →
bant durması → majöre çözülen final). 4 notalık **sonik logo** (La–Mi–Do–La) girişte, logoda, barkod biplerinde (biplerin notaları
motifin notaları), satış "çiling"inde, ana melodide, stokta piyanoda ve finalde majör olarak tekrar eder.

Ekranlar uygulamanın gerçek ekranlarıdır (ayrı demo veritabanı, "Köşe Market"); sayaçlardaki rakamlar o ekranlardan okunur.
Müzik ve ses efektleri `music.py` ile sıfırdan sentezlenir; telif hakkı sorunu yoktur.

| Dosya | Ne yapar |
|---|---|
| `timeline.json` | Sahne süreleri ve ses efekti zamanları (görüntü ve müzik buradan senkron kalır). |
| `capture.mjs` | Demo sunucudan (port 3200) ekran görüntüleri + önemli öğelerin konumları ve rakamlar (`boxes.json`). Bu ayın örnek giderlerini ekler, gün sonu raporu e-postasını çeker. |
| `composition.html` | Animasyonlu kurgu; her kare `renderFrame(t)` ile zamana göre çizilir. |
| `render.mjs` | Kurguyu kare kare JPEG olarak çizer (ya da seçilen anların önizlemesini alır). |
| `music.py` | 128 BPM, bölüm bölüm değişen müzik + sonik logo + geçiş/bip/tuş/zil/darbe/bant durması efektleri → WAV (Python 3 + numpy). |
| `encode.swift` | Kareler + WAV → MP4 (macOS AVFoundation; ffmpeg gerekmez). |

## Yeniden üretmek

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm run build
W=/tmp/promo-work; mkdir -p $W
# 1) Demo veritabanı + hesaplar + sunucu (gerçek veriden ayrı)
export DB_PATH=data/promo/store.db BACKUP_DIR=data/promo/backups
npx tsx scripts/seed.ts
npx tsx scripts/users-cli.ts create-owner ayse demo-sifre-2026 --email=ayse.ornek@gmail.com Ayşe Yılmaz
npx tsx scripts/users-cli.ts create-cashier "Mehmet Kaya" 2468   # Kasiyer No 1001
# MAIL_DEV_DIR: e-posta gönderimi test modunda (gün sonu raporu dosyaya yazılır, videoda gösterilir)
SESSION_SECRET=promo-only-secret-0123456789abcdef0123456789 MAIL_DEV_DIR=data/promo/mail MARKET_KASA_NO_SCHEDULER=1 node node_modules/next/dist/bin/next start -p 3200 &
# 2) Ekranlar
MAIL_DEV_DIR=data/promo/mail node promo/capture.mjs $W/shots
# 3) Müzik, kareler, video
python3 promo/music.py $W/music.wav
node promo/render.mjs $W frames            # önizleme için: node promo/render.mjs $W preview 3 13 20.5 (saniye)
swiftc -O -swift-version 5 promo/encode.swift -o $W/encode
$W/encode $W/frames $W/music.wav promo/market-kasa-tanitim.mp4 30 8000000
# 4) Demo sunucuyu kapat ve demo veriyi sil
kill $(lsof -tiTCP:3200 -sTCP:LISTEN); rm -rf data/promo
```
