# Market Kasa e-posta servisi — kurulum rehberi

Bu klasör, programların (müşteri bilgisayarlarındaki Market Kasa'ların) e-posta gönderdiği **merkezi servistir**.
Müşteri Gmail ayarı, uygulama şifresi vb. ile uğraşmaz: Ayarlar → **E-posta bağla**'ya sadece kendi adresini yazar,
gelen 6 haneli kodu girer; gün sonu raporu ve şifre kodları bundan sonra "Market Kasa" adına bu servisten gider.

Bu kurulumu **bir kez** siz yaparsınız (yaklaşık 30–45 dakika). Hesap açma ve ödeme adımlarını siz yaparsınız;
gizli anahtarları kimseyle (Claude dahil) paylaşmayın, sadece aşağıda söylenen yere yazın.

## Maliyet (yaklaşık)

| Ne | Neden | Ücret |
|---|---|---|
| Alan adı (ör. `marketkasa.com`) | E-postalar bu adresten gider (`bildirim@marketkasa.com`) | yılda ~10 $ |
| Cloudflare hesabı | Servis burada çalışır | Ücretsiz plan yeterli |
| Resend hesabı | E-postayı teslim eder | Ücretsiz: ayda 3.000 e-posta (günde 100). Fazlası: ayda 20 $ → 50.000 e-posta |

Kabaca: her dükkân günde 1 rapor gönderir → ücretsiz plan ~**90 dükkâna** kadar yeter.

## Nasıl korunuyor (kötüye kullanım)

- Her program ilk bağlanışta servise kayıt olur ve kendine özel gizli bir anahtar alır (serviste sadece özeti saklanır).
- Servis, rapor/kod e-postasını **yalnızca o programda kodla doğrulanmış adreslere** gönderir. Yani biri programı
  ele geçirse bile rastgele adreslere e-posta (spam) atamaz.
- Doğrulama kodunu servis kendisi üretir ve sabit bir metinle gönderir.
- Sınırlar: IP başına günde 10 kayıt; program başına saatte 10, adres başına saatte 5 kod; program başına günde 60 e-posta;
  e-posta başına en çok 10 alıcı ve 6 MB. (Değiştirmek için `src/worker.ts` → `LIMITS`.)

---

## 1. Cloudflare hesabı

1. https://dash.cloudflare.com/sign-up adresinden hesap açın (e-posta + şifre). E-postanızı doğrulayın.

## 2. Alan adı

1. Cloudflare panelinde soldan **Domain Registration → Register Domains**.
2. İstediğiniz adı arayın (ör. `marketkasa.com`, `marketkasa.com.tr` burada satılmaz; `.com`/`.app`/`.net` olur) ve satın alın.
   Alan adı zaten başka bir yerde varsa: **Add a domain** ile Cloudflare'e ekleyip ad sunucularını Cloudflare'inkilerle değiştirin.

## 3. Resend hesabı ve alan adı doğrulama

1. https://resend.com/signup adresinden hesap açın.
2. **Domains → Add Domain** → alan adınızı yazın (ör. `marketkasa.com`), bölge olarak **eu-west-1 (Ireland)** seçin.
3. Resend size birkaç DNS kaydı (TXT/MX) gösterir. **"Sign in to Cloudflare"** (otomatik) düğmesi varsa ona basın;
   yoksa her kaydı Cloudflare → alan adınız → **DNS → Records → Add record** ile aynen ekleyin.
4. Resend'de **Verify DNS Records**'a basın. Birkaç dakika içinde durum **Verified** olur.

## 4. Resend API anahtarı

1. Resend → **API Keys → Create API Key**. Ad: `market-kasa-mail`, izin: **Sending access**, alan adı: sizinki.
2. Çıkan anahtarı (`re_...`) **sadece bir kez** gösterir. Kopyalayın; 5. adımda terminale yapıştıracaksınız.
   Bu anahtarı hiçbir dosyaya, sohbete veya GitHub'a yazmayın.

## 5. Servisi yayına alma (Mac terminalinde)

Terminalde proje klasöründe sırayla:

```bash
cd ~/market-pos/mail-service
```

Cloudflare'e giriş (tarayıcı açılır, **Allow** deyin):

```bash
npx wrangler login
```

Servisin küçük veritabanını oluşturun:

```bash
npx wrangler kv namespace create KV
```

Çıktıda `id = "...."` görünür. `wrangler.toml` dosyasında `KV_NAMESPACE_ID` yazan yere bu id'yi yazın.
Aynı dosyada `FROM_ADDRESS` satırındaki `ALAN-ADINIZ.com`'u kendi alan adınızla değiştirin
(ör. `Market Kasa <bildirim@marketkasa.com>`).

Resend anahtarını servise gizli olarak kaydedin (komut anahtarı sorar; 4. adımdaki `re_...` anahtarını yapıştırıp Enter):

```bash
npx wrangler secret put RESEND_API_KEY
```

Yayına alın:

```bash
npx wrangler deploy
```

Çıktının sonunda servis adresi yazar, ör. `https://market-kasa-mail.<hesabiniz>.workers.dev`.
Tarayıcıda bu adresin sonuna `/v1/health` ekleyip açın: `{"ok":true}` görmelisiniz.

## 6. Programı servise bağlama (bunu Claude yapabilir)

1. `src/server/mail/service.ts` dosyasında `DEFAULT_MAIL_SERVICE_URL = ""` satırına 5. adımdaki adresi yazın.
2. Testler yeşilken yeni sürüm yayınlanır; müşterilerin programı kendini günceller ve Ayarlar'da
   **"E-posta bağla"** (sadece adres + kod) görünür. Servis adresi boşken programlar eski yolla (Gmail uygulama şifresi) çalışır.

İsterseniz ilk denemeyi kendi programınızda yapın: Ayarlar → E-posta bağla → kendi adresiniz → gelen kod →
**Bugünün raporunu şimdi gönder**.

## Bakım

- Gönderilen e-postalar ve hatalar: Resend → **Emails / Logs**.
- Servis hataları: `npx wrangler tail` (canlı kayıt) ya da Cloudflare → Workers → market-kasa-mail → **Logs**.
- Servis kodunu değiştirdikten sonra: `cd ~/market-pos/mail-service` ve `npx wrangler deploy`.
- Resend anahtarı sızdıysa: Resend'de anahtarı silin, yenisini oluşturup `npx wrangler secret put RESEND_API_KEY` ile değiştirin.

## Geliştirici notu

Servis kodu `src/worker.ts` (Cloudflare tipleri olmadan, en küçük arayüzle). Testleri ana projede:
`tests/unit/mail-service.test.ts` (servis kuralları) ve `tests/integration/mail-service-app.test.ts`
(program ↔ servis uçtan uca, yerel HTTP sunucusuyla; gerçek e-posta gönderilmez). Program tarafı `src/server/mail/service.ts`.
`MARKET_KASA_MAIL_SERVICE` ortam değişkeni sadece test içindir; kurulum paketleri bunu ayarlamaz.
