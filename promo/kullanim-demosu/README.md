# Kullanım demosu (müşterilere gönderilecek video)

Hazır video: [`optiva-kullanim-demosu.mp4`](optiva-kullanim-demosu.mp4) — 85,6 sn, 1920×1080, 30 fps, H.264 + AAC stereo, 19 MB
(e-posta ve WhatsApp için uygun boyut).

Tanıtım videosundan (`promo/optiva-tanitim.mp4`) farkı: kurgu değil, **gerçek kullanım kaydı**. Program ayrı bir demo veritabanıyla açılır,
bir kullanıcı gibi imleçle tıklanır, klavyeyle yazılır, barkod okutulur; her adımın altında kısa Türkçe açıklama çıkar.

Akış (10 başlık): açılış (logo) → **1 Kasiyer girişi** (Kasiyer No + PIN tuş takımıyla) → **2 Satış** (3 barkod okutma, adıyla ürün bulma,
adet artırma, F8 nakit, alınan para, para üstü) → **3 Yönetici paneli** (yönetici girişi, Genel bakış) → **4 Ürün ve stok** (listeden fiyat
değiştirme, mal girişi, barkod etiketleri) → **5 Bugün ve gün sonu** (günün özeti, gün sonu kasa sayımı, fişten iade/iptal) →
**6 Giderler ve kâr-zarar** → **7 Kasiyer performansı** (Excel) → **8 Analizler** (yoğun saatler, ABC, sipariş önerisi) →
**9 Yapay zekâ asistanı** (tek tıkla aylık rapor, hedefler, ₺ etkili aksiyonlar) → **10 Kullanıcılar ve ayarlar** → kapanış.

Müzik ve ses efektleri `music.py` ile sıfırdan sentezlenir (telif sorunu yok): 112 BPM, sıcak ve pozitif; her başlığın kendi akor
yürüyüşü ve arpej deseni var, melodi her ölçüde yeniden üretilir; yapay zekâ bölümünde Do majörden Re majöre yükselir.
Tıklama, tuş, barkod bip'i, satış zili ve yapay zekâ pırıltısı kayıttaki olaylara kare kare denk gelir.

| Dosya | Ne yapar |
|---|---|
| `reset-db.sh` | Demo veritabanını (`data/demo`) sıfırlar: örnek veriler, yönetici `ayse`, kasiyerler 1001 ve 1002. Gerçek veriye dokunmaz. |
| `record.mjs` | Demo sunucuya (port 3400) bağlanır, ay başı giderlerini ve bir toptancı zammını ekler, sonra ekranı kaydederek uygulamayı kullanır (imleç, tıklama halkası, açıklama, açılış/kapanış kartı sayfanın üstüne çizilir). `SPEED` tempoyu ayarlar. |
| `assemble.mjs` | Zaman damgalı kareleri sabit 30 fps'e çevirir, sayfa yükleme beklemelerini keser; ses olaylarını video zamanına çevirir (`sfx.json`). |
| `music.py` | Müzik + ses efektleri → WAV (Python 3 + numpy). |

Görüntü + ses birleştirme tanıtım videosunun `promo/encode.swift` aracıyla yapılır (ffmpeg gerekmez).

## Yeniden üretmek (ör. ekranlar değişince)

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm run build
W=/tmp/demo-work; mkdir -p $W
# 1) Demo veritabanı + sunucu (gerçek veriden ayrı; her kayıttan önce sıfırlanmalı: kayıt satış, mal girişi, gider ekler)
promo/kullanim-demosu/reset-db.sh
DB_PATH=data/demo/store.db BACKUP_DIR=data/demo/backups SESSION_SECRET=demo-only-secret-0123456789abcdef0123456789 MARKET_KASA_NO_SCHEDULER=1 node node_modules/next/dist/bin/next start -p 3400 &
# 2) Kayıt, kareler, müzik, video (son sayı bit hızı: 1600000 ≈ 19 MB; yüksek kalite için 9000000)
node promo/kullanim-demosu/record.mjs $W
node promo/kullanim-demosu/assemble.mjs $W
python3 promo/kullanim-demosu/music.py $W/sfx.json $W/music.wav
swiftc -O -swift-version 5 promo/encode.swift -o $W/encode
$W/encode $W/frames $W/music.wav promo/kullanim-demosu/optiva-kullanim-demosu.mp4 30 1600000
# 3) Demo sunucuyu kapat ve demo veriyi sil
kill $(lsof -tiTCP:3400 -sTCP:LISTEN); rm -rf data/demo
```
