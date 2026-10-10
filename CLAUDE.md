@AGENTS.md

# market-pos — Proje Kuralları

Tek dükkânlık barkodlu satış / stok / kârlılık sistemi (iç takip; yasal fiş yazar kasadan).
Sahibi yazılımcı değil: kararları sade Türkçe açıkla. Arayüz Türkçe, kod İngilizce.
Bu dosyadaki iş kuralları **değiştirilemez**; teknik sorun çıkarırsa dur ve kullanıcıya sor.

## Komutlar
Node `~/.local/node/bin` altında (Bash'te `export PATH="$HOME/.local/node/bin:$PATH"`).
`npm run lint` · `npm run typecheck` · `npm test` · `npm run test:e2e` · `npm run seed` · `npm run backup` · `npm run check:integrity`
Her aşama sonunda lint + typecheck + test yeşil olmadan ilerleme.

## Mimari
- Next.js 16 App Router, TS strict, Tailwind. **cacheComponents kapalı** (veri hep taze).
- SQLite + better-sqlite3 (WAL, foreign_keys=ON). Tüm SQL `src/server/db/repositories/` içinde.
- İş akışları `src/server/services/`; saf hesap fonksiyonları `src/lib/` (sunucu + tarayıcı ortak).
- Servisler `ctx = { db, now }` alır (test ve seed için saat enjekte edilebilir).
- Yazma işlemleri `db.transaction(...).immediate()` ile.
- Girdiler Zod ile; hata formatı `{ error: { code, message (Türkçe), details? } }`.
- Migration: `src/server/db/migrations/NNN_*.sql`, açılışta sırayla uygulanır.

## Para / KDV / Kâr
- Para **her zaman tam sayı kuruş** (`*_kurus`, INTEGER). Float ile para hesabı YASAK.
  Bölme/yuvarlama yalnızca tam sayı aritmetiğiyle (`divRoundHalfUp`), yarım yukarı.
- Gösterim `Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'})`; giriş `parseTRYToKurus()` (`12,5` / `12.50` / `1.234,56`).
- Satış ve alış fiyatı **KDV dahil**. KDV oranları yalnızca 1, 10, 20 (varsayılan 20).
- Maliyet: ağırlıklı ortalama. `eski=max(stok,0)`; `eski>0 ? round((eski*ort + adet*birim)/(eski+adet)) : birim`.
- Kalem: `gross=price*qty`, `total=gross-disc`, `net=round(total*100/(100+vat))`, `vat=total-net`,
  `cost=unitCost*qty`, `costNet=round(cost*100/(100+vat))`, `profit=net-costNet` (ANA KÂR).
- Satışta fiyat/maliyet/KDV/ad/barkod **snapshot**; eski satış kârı asla değişmez.
- Sepet indirimi (TL veya tam sayı %) kalemlere satır brütü oranında, en büyük kalan yöntemiyle; toplam kuruşu kuruşuna eşit, satır < 0 olamaz.
- Kısmi iade tutarları birikimli hesaplanır: `f(r+k) - f(r)`, `f(n)=round(lineX*n/qty)` → tam iade = satır tutarı.
- Marj = brüt kâr / KDV hariç ciro; ciro 0 ise "—".

## Zaman
- Zaman damgası UTC ISO. `business_date` = Europe/Istanbul `YYYY-MM-DD`, tek kaynak `getBusinessDate()`.
- Fiş no `YYYYMMDD-NNNN`, iş gününe göre 0001'den, transaction içinde. Hafta Pazartesi başlar.

## Barkod
- `product_barcodes.barcode` UNIQUE; ürün başına en fazla 1 birincil.
- Dükkân içi: EAN-13, `200` + 9 hane sıra + kontrol basamağı; sadece rakam (Türkçe klavye sorunu).
- `normalizeBarcode`: kontrol karakteri/boşluk temizle; 13/8 hane rakamsa kontrol basamağı doğrula (hatalıysa eşleştirme yok);
  12 hane → olduğu gibi, yoksa `0`+kod; rakam dışı → büyük/küçük harf duyarlı aynen.
- Kasada eşleşme istemcide `Map<barcode, productId>`; sunucu satışta her şeyi DB'den yeniden doğrular, istemci fiyatına güvenmez.

## Stok
- Değişmez: `products.stock_qty == SUM(stock_movements.qty_change)` her ürün için.
- Yetersiz stokta satış reddedilir (`allow_negative_stock` açıksa uyarıyla izin).
- Ürün silinmez, pasife alınır.

## Roller
- `owner`: her şey. `cashier`: sadece kasa; maliyet/kâr alanları API yanıtlarında **hiç olmaz**; void/iade/mal girişi yok.
- Kasiyer indirimi `cashier_can_discount` ayarına bağlı (varsayılan kapalı).
- Rol kontrolü her zaman sunucuda. 5 hatalı denemede 5 dk kilit (kasiyer PIN'i ve yönetici şifresi ayrı sayılır).
- Hesaplar `users` tablosunda (Aşama 9 kararı, kullanıcı onaylı): yönetici = kullanıcı adı + şifre (≥ 8) + e-posta, kasiyer = ad + PIN (4–8 rakam, aktif kasiyerler arasında tekil)
  + otomatik **Kasiyer No** (`cashier_no`, 1001'den artan, asla yeniden kullanılmaz). Kasiyer girişi = Kasiyer No + PIN.
  Sır'lar scrypt ile hash'lenir; `.env`'de PIN yok.
- E-posta onayı (kullanıcı kararı): ilk kurulum (`/kurulum`: gönderim hesabı → bilgiler → kod), şifre/PIN değiştirme ve sıfırlama (yalnız yönetici yapar;
  kasiyerinki dahil), yönetici e-posta değişimi ve "Şifremi unuttum" her zaman yöneticinin e-postasına giden 6 haneli kodla tamamlanır.
  Kod: HMAC hash, 10 dk, 5 deneme, 60 sn yeniden gönderme aralığı, tek kullanımlık; girdi kod tüketilmeden önce doğrulanır.
  E-posta yoksa son çare `npm run users -- reset-password` (kasa bilgisayarında).
- Gönderim hesabı (Gmail uygulama şifresi önerilir; Outlook/iCloud/Yandex/SMTP) `settings`'te, şifre AES-256-GCM ile şifreli. Test modu: `MAIL_DEV_DIR`
  (postalar JSON dosyası olur) — yalnızca e2e/smoke test ortamında; kurulum paketleri bunu asla ayarlamaz.
- Günlük rapor: Günü Kapat'ta + yedek saatte (varsayılan 23:30; kaçarsa ertesi açılışta dünkü) yönetici e-postalarına HTML özet + ürün kârlılığı Excel'i.
  Gün başına bir otomatik gönderim (`daily_report_log`); hareketsiz gün atlanır. Zamanlayıcı `src/instrumentation.ts` → `src/server/scheduler.ts`.
- Oturum her istekte DB'den doğrulanır (aktif mi, rol, `session_version`); şifre/PIN değişimi ve pasife alma eski oturumları düşürür.
- Kendini veya son aktif yöneticiyi pasife alamazsın. Kullanıcılar silinmez, pasife alınır.
- Yönetim işlemleri `audit_log`'a (işlem geçmişi) servis transaction'ı içinde yazılır; satışlar `user_id`/`user_name` taşır.

## Kararlaştırılmış varsayımlar
- İadeli satış iptal edilemez; iptal satıştan iade olmaz; iptal sadece aynı iş günü + gün açık.
- Bugün kapalıysa satış ve iade 409; mal girişi/stok sayımı kapalı güne de yazılabilir.
- Nakitte alınan para boşsa tam tutar alındı sayılır.
- Beklenen kasa = açılış kasası + nakit satış − nakit iade.

## Test ve teknik notlar
- `npm test`: Vitest (tests/unit, tests/integration; bellek içi SQLite; API uçları Request ile doğrudan çağrılır,
  `setTestCtxFactory`). `npm run test:e2e`: önce `next build`, sonra Playwright `next start -p 3100`
  AYRI veritabanıyla (`data/e2e/`; seed + `users-cli` ile yönetici `e2e-admin`, kasiyer PIN 8765). Gerçek veriye dokunulmaz.
- Oturum çerezi okumayan sayfalar (`/login`, `/kurulum`) DB okumadan önce `await connection()` çağırır; yoksa derlemede statik sabitlenir.
- Okuyucu: `ScannerDetector` saf mantık; hook zamanı `event.timeStamp` ile ölçer (işlenme anı değil).
  Tuş yolunda ağır iş yapma (ör. AudioContext ilk tuşta oluşturulunca ilk karakter düşüyordu; sayfa açılışında hazırlanır).
- Kasiyer görünümleri izin listesiyle (`src/server/views.ts`); yeni alan eklerken kasiyere sızmasın.
- Raporlar tek tanımdan (`src/server/services/reports.ts`) hem ekran hem Excel üretir.
- Excel'e TL/yüzde yazarken metin üzerinden sayıya çevrilir (`kurusToExcelNumber`), float aritmetiği yok.
- Migration 002: `returns.cost_total_kurus`, `return_items.cost_kurus` (KDV dahil maliyet payı).
- Migration 004: `users.email`, `users.cashier_no`, `verification_codes`, `daily_report_log`.
- Testlerde e-posta: `captureMail()` (tests/apiHelpers.ts); e2e'de `latestMailCode()` `data/e2e/mail`'den kodu okur.
- Güncelleme (`src/server/update/`, kullanıcı kararı): sürüm `1.1.<GitHub derleme no>` → `app/version.json` (kanal "windows"); proje klasöründe
  (Mac) kanal "dev", denetim yok. Yayında `latest.json` (sürüm, boyut, SHA-256). Denetim açılışta + 6 saatte bir; yönetici
  Ayarlar → Güncelle: yedek → indir (`MARKET_UPDATE_DIR`, başlatıcı verir) → SHA-256 doğrula → sayfa `market-kasa:install-update`
  mesajı → `Market Kasa.exe` sessiz kurulumu `/relaunch=1` ile başlatıp kapanır → kurulum programı yeniden açar. Asla kendiliğinden kurulmaz.
  İndirme adresi sabit (GitHub); `MARKET_KASA_UPDATE_BASE` yalnızca testler içindir.
- `docs/kilavuz/` (kullanma kılavuzu PDF'i) ve `promo/` (tanıtım videosu) üreticileri ayrı demo veritabanıyla çalışır
  (`data/guide`, `data/promo`; port 3300/3200). Ekranlar değişirse yeniden üretilir; adımlar klasörlerdeki README'lerde.
- Uygulama penceresi: Mac'te `mac/MarketKasa.swift` (WKWebView; ikili `mac/bin/MarketKasa` depoda, `mac/build.sh` ile derlenir,
  `scripts/create-app.sh` paketler), Windows'ta `windows/launcher/MarketKasa.cs` (WebView2). İkisi de `--selftest` ile sınanır.
  WKWebView `window.print`/indirme/`confirm`/`prompt`/dosya seçmeyi kendisi yapmaz; Swift tarafında karşılanır — yeni böyle bir
  tarayıcı özelliği kullanılırsa orada da desteklenmeli.
