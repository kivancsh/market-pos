# Tanıtım videosu

Hazır video: [`market-kasa-tanitim.mp4`](market-kasa-tanitim.mp4) — 40 sn, 1920×1080, 30 fps, H.264 + AAC stereo.

Akış: açılış (logo) → "satış · stok · kâr takibi" → **Adım 1** giriş (PIN) → **Adım 2** barkod okutma →
**Adım 3** nakit ödeme, para üstü → **Adım 4** panel ve telefon → **Adım 5** Yönetim Paneli'nden toplu fiyat →
"Ve dahası" (etiket, raporlar, işlem geçmişi, kasiyer hesapları) → kapanış.

Ekranlar uygulamanın gerçek ekranlarıdır (ayrı demo veritabanı, "Köşe Market"). Müzik ve ses efektleri
`music.py` ile sıfırdan sentezlenir; telif hakkı sorunu yoktur.

| Dosya | Ne yapar |
|---|---|
| `timeline.json` | Sahne süreleri ve ses efekti zamanları (görüntü ve müzik buradan senkron kalır). |
| `capture.mjs` | Demo sunucudan (port 3200) ekran görüntüleri + önemli öğelerin konumları (`boxes.json`). |
| `composition.html` | Animasyonlu kurgu; her kare `renderFrame(t)` ile zamana göre çizilir. |
| `render.mjs` | Kurguyu kare kare JPEG olarak çizer (ya da seçilen anların önizlemesini alır). |
| `music.py` | 120 BPM müzik + geçiş/bip/tuş/zil efektleri → WAV (Python 3 + numpy). |
| `encode.swift` | Kareler + WAV → MP4 (macOS AVFoundation; ffmpeg gerekmez). |

## Yeniden üretmek

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm run build
W=/tmp/promo-work; mkdir -p $W
# 1) Demo veritabanı + hesaplar + sunucu (gerçek veriden ayrı)
export DB_PATH=data/promo/store.db BACKUP_DIR=data/promo/backups
npx tsx scripts/seed.ts
npx tsx scripts/users-cli.ts create-owner ayse demo-sifre-2026 Ayşe Yılmaz
npx tsx scripts/users-cli.ts create-cashier "Mehmet Kaya" 2468
SESSION_SECRET=promo-only-secret-0123456789abcdef0123456789 node node_modules/next/dist/bin/next start -p 3200 &
# 2) Ekranlar (PROMO_DAY: panelde gösterilecek dolu bir gün)
PROMO_DAY=2026-10-09 node promo/capture.mjs $W/shots
# 3) Müzik, kareler, video
python3 promo/music.py $W/music.wav
node promo/render.mjs $W frames            # önizleme için: node promo/render.mjs $W preview 3 13 20.5
swiftc -O -swift-version 5 promo/encode.swift -o $W/encode
$W/encode $W/frames $W/music.wav promo/market-kasa-tanitim.mp4 30 8000000
# 4) Demo sunucuyu kapat ve demo veriyi sil
kill $(lsof -tiTCP:3200 -sTCP:LISTEN); rm -rf data/promo
```
