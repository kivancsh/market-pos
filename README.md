# Market Kasa

Küçük bir dükkân için **barkodlu satış, stok ve kârlılık takip** sistemi.
Barkod okuyucuyla satış yapılır, stok kendiliğinden düşer, gün içinde ve gün sonunda ciro, kâr ve stok durumu görülür.

> **Önemli:** Bu sistem **iç takip** içindir. Yasal fiş yine yazar kasadan (ÖKC) kesilir.
> Bu programın yazdırdığı fişte "Bilgi fişidir, mali değeri yoktur." yazar.

---

## İçindekiler

- [Kullanma kılavuzu (PDF)](#kullanma-kılavuzu-pdf)
- [Tanıtım videosu](#tanıtım-videosu)
- [Windows'a kurulum (Setup.exe)](#windowsa-kurulum-setupexe)
- [Kolay kurulum: masaüstü simgesi (Mac)](#kolay-kurulum-masaüstü-simgesi-mac)
1. [İlk kurulum](#1-ilk-kurulum)
2. [Dükkânda çalıştırma ve telefondan erişim](#2-dükkânda-çalıştırma-ve-telefondan-erişim)
3. [Barkod okuyucuyu bağlama](#3-barkod-okuyucuyu-bağlama)
4. [Günlük kullanım](#4-günlük-kullanım)
5. [Barkod etiketi yazdırma](#5-barkod-etiketi-yazdırma)
6. [Bilgi fişi yazdırma](#6-bilgi-fişi-yazdırma)
7. [Yedekleme ve geri yükleme](#7-yedekleme-ve-geri-yükleme)
8. [Hesaplar: yönetici, kasiyerler, şifre sıfırlama](#8-hesaplar-yönetici-kasiyerler-şifre-sıfırlama)
9. [Gerçek kullanıma geçiş (örnek verileri silme)](#9-gerçek-kullanıma-geçiş-örnek-verileri-silme)
10. [Bilinen sınırlar ve sonraki adımlar](#10-bilinen-sınırlar-ve-sonraki-adımlar)
11. [Teknik bilgiler (geliştirici için)](#11-teknik-bilgiler-geliştirici-için)

---

## Kullanma kılavuzu (PDF)

📘 **[Market Kasa Kullanma Kılavuzu (PDF, 50 sayfa)](docs/Market%20Kasa%20Kullanma%20K%C4%B1lavuzu.pdf)**

Bilgisayardan anlamayan biri için yazılmış, resimli ve adım adım anlatım. Her ekran görüntüsünün üzerinde kırmızı numaralar, altında "burası ne işe yarar" açıklaması vardır.

- Mac'e ve **Windows'a kurulum** (uyarı penceresi, kurulum yardımcısı, Başlat menüsü, bilgilerin yeri), programı açıp kapatma, ilk yönetici hesabı, giriş
- **Satış:** okutma, adet, adla arama, nakit/kart, para üstü, bilgi fişi, indirim, bilinmeyen barkod, kısayollar, kasa mesajları
- Ürün ekleme, Excel'den aktarma, fiyat değiştirme (tek ürün ve toplu), kategoriler, barkod etiketi
- Mal girişi, stok sayımı, iade ve iptal, panel, gün sonu, raporlar, telefondan takip
- Kasiyer hesapları, şifreler, işlem geçmişi, ayarlar, barkod okuyucu, yedekleme
- Sorun çözme tablosu, kelimelerin anlamı ve kasanın yanına asılacak **günlük kullanım özeti**

Kılavuzu yeniden üretmek (ekranlar değişince): [`docs/kilavuz/README.md`](docs/kilavuz/README.md).

## Tanıtım videosu

🎬 **[Market Kasa tanıtım videosu (40 sn, 1080p, müzikli)](promo/market-kasa-tanitim.mp4)**

Lansman tarzı, "nasıl kullanılır" videosu: giriş → barkod okutma → nakit ödeme ve para üstü → panelde kâr (telefondan da) → Yönetim Paneli'nden toplu fiyat → etiket, raporlar, işlem geçmişi, kasiyer hesapları. Ekranlar uygulamanın gerçek ekranlarıdır; müzik ve efektler bu proje için sentezlendi (telifsiz).

Videoyu yeniden üretmek: [`promo/README.md`](promo/README.md).

---

## Windows'a kurulum (Setup.exe)

🪟 **[Market-Kasa-Setup.exe'yi indir (en son sürüm)](https://github.com/kivancsh/market-pos/releases/latest/download/Market-Kasa-Setup.exe)**

Klasik Windows kurulumu: dosyaya çift tıklayın → **Sonraki → Sonraki → Kur → Bitti**. Bilgisayarda başka hiçbir şeyin kurulu olması gerekmez ve yönetici izni istemez. Masaüstüne ve Başlat menüsüne **Market Kasa** simgesi gelir.

- İlk çalıştırmada "Windows kişisel bilgisayarınızı korudu" uyarısı çıkarsa: **Ek bilgi → Yine de çalıştır**.
- Resimli anlatım: kılavuzun **5. bölümü**.
- Simgeye tıklayınca program **kendi penceresinde** açılır (Microsoft Edge WebView2 ile; Windows 10/11'de hazır gelir). Pencere açıkken tekrar tıklarsanız pencere öne gelir. Pencereyi kapatmak programı kapatmaz; menü **Market Kasa → Programı tamamen kapat** ile kapanır.
- Başlat menüsü → Market Kasa: **Yedek Al**, **Yedekler klasörü**, **Yönetici Şifresi Sıfırla**.
- Bilgiler `%LOCALAPPDATA%\Market Kasa` klasöründedir; programı kaldırmak ya da güncellemek bilgileri **silmez**.

Kurulum dosyası her kod güncellemesinde GitHub'ın Windows bilgisayarında otomatik üretilir ve **gerçekten kurulup açılarak test edilir**. Ayrıntılar: [`windows/README.md`](windows/README.md).

---

## Kolay kurulum: masaüstü simgesi (Mac)

1. Klasördeki **Kurulum** dosyasına çift tıklayın. Eksikleri tamamlar (paketler, ayar dosyası, derleme) ve **masaüstüne "Market Kasa" uygulama simgesini** koyar. (Node.js kurulu değilse indirme sayfasını açar; kurduktan sonra tekrar çift tıklayın.)
2. Programı açmak için masaüstündeki **Market Kasa** simgesine çift tıklayın. Program **kendi penceresinde** açılır (tarayıcı gerekmez; adres çubuğu/sekme yok, Dock'ta kendi simgesi). Sunucu arka planda çalışır. Simgeyi Dock'a da sürükleyebilirsiniz.
3. Pencerenin üst menüsü: **Market Kasa** (Telefondan bağlanma, Tarayıcıda aç, Programı tamamen kapat) · **Dosya** (Yazdır ⌘P) · **Görünüm** (Yenile ⌘R, Yakınlaştır/Uzaklaştır) · **Git** (Kasa ⌘1, Panel ⌘2, Yönetim Paneli ⌘3). Bilgi fişi ayrı küçük pencerede açılıp yazdırılır; Excel raporları İndirilenler klasörüne iner.
4. **İlk açılışta** "Yönetici hesabı oluştur" ekranı gelir: adınızı, bir kullanıcı adı ve en az 8 karakterlik bir şifre belirleyin. Sonra **Yönetim Paneli → Kullanıcılar**'dan kasiyerleri (ad + PIN) ekleyin.
5. Pencereyi kapatmak programı kapatmaz (telefondan takip sürer). Program; menüden **Market Kasa → Programı tamamen kapat** denene ya da bilgisayar kapanana kadar çalışır. Bilgisayarı açtıktan sonra simgeye bir kez tıklamanız yeterlidir.

Klasördeki diğer çift tıklanabilir dosyalar:

| Dosya | Ne yapar |
|---|---|
| **Yönetici Şifresi Sıfırla** | Yönetici şifresini unuttuysanız yeni şifre belirler (yazarken ekranda görünmez). Program açıkken de çalışır. |
| **Yedek Al** | Anlık yedek alır ve `backups` klasörünü açar. |

- Bir sorun olursa program kayıtları `data/logs/` klasöründedir (`server.log`, `build.log`).
- Programı görünür bir Terminal penceresinde çalıştırmak (sorun ararken) için: `scripts/market-kasa.command`.
- `market-pos` klasörünü başka bir yere taşırsanız **Kurulum**'a tekrar çift tıklayın (simge yeni yeri öğrenir).
- Kodda güncelleme olduğunda (ör. GitHub'dan yeni sürüm) programı kapatın; simgeye tekrar tıkladığınızda gerekiyorsa kendisi yeniden derler (ya da **Kurulum**'u çalıştırın).

Aşağıdaki Terminal adımları, bu dosyaların yaptığı işin elle yapılışıdır; kısayolları kullanıyorsanız gerekmez.

## 1. İlk kurulum

Aşağıdaki komutlar **Terminal** uygulamasına yazılır (Mac'te: Finder → Uygulamalar → İzlenceler → Terminal).

### 1.1 Node.js

Programın çalışması için **Node.js 24 (LTS)** gerekir.

- Bu bilgisayarda kurulu: `~/.local/node` klasörüne kuruldu ve terminale tanıtıldı. Yeni bir Terminal penceresinde `node -v` yazınca `v24…` görmelisiniz.
- Başka bir bilgisayarda: [nodejs.org](https://nodejs.org) adresinden **LTS** sürümünü indirip kurun.

### 1.2 Programı hazırlama

```bash
cd ~/Desktop/market-pos
```

```bash
npm install
```

### 1.3 Ayar dosyası (.env)

```bash
cp .env.example .env
```

Bu dosyada şifre/PIN **yoktur**; hesaplar programın içinde tutulur (bkz. [Hesaplar](#8-hesaplar-yönetici-kasiyerler-şifre-sıfırlama)).

### 1.4 Örnek veriler (isteğe bağlı, denemek için)

```bash
npm run seed
```

27 örnek ürün, barkodları ve son 14 günün satışları oluşur. Barkod listesi `data/seed-barcodes.csv` dosyasına yazılır (Excel'de açılabilir).

> ⚠️ `npm run seed` veritabanını **sıfırlar**. İçinde satış varsa silmeden önce `backups/` klasörüne otomatik yedek alır. Hesaplar da silinir; sonraki açılışta yönetici hesabı yeniden oluşturulur.

### 1.5 Deneme amaçlı çalıştırma

```bash
npm run dev
```

Tarayıcıda **http://localhost:3000** adresini açın. Durdurmak için Terminal'de `Ctrl + C`.

---

## 2. Dükkânda çalıştırma ve telefondan erişim

Dükkânda "deneme" modu yerine hızlı ve kararlı **üretim** modu kullanılır:

```bash
npm run build
```

```bash
npm run start:shop
```

(Bu, belgede geçen `npm run start -- -H 0.0.0.0` komutuyla aynıdır.) Kod değişmedikçe `build` bir kez yeterlidir; sonraki açılışlarda sadece `npm run start:shop`.

- Kasa bilgisayarında: **http://localhost:3000**
- **Telefondan panel** (telefon ve bilgisayar **aynı Wi-Fi'de** olmalı):
  1. Bilgisayarın yerel IP adresini öğrenin. Ya **Sistem Ayarları → Wi-Fi → bağlı ağın yanındaki "Ayrıntılar" → IP adresi** ya da Terminal'de:
     ```bash
     ipconfig getifaddr en0
     ```
     (Kablolu bağlantıda `en1` deneyin.) Örneğin `192.168.1.34`.
  2. Telefonun tarayıcısında **http://192.168.1.34:3000/panel** adresini açın, **Yönetici** sekmesinden kullanıcı adı ve şifrenizle girin.
  3. Mac "gelen bağlantılara izin verilsin mi?" diye sorarsa **İzin Ver** deyin.
- Aynı şekilde ikinci bir bilgisayar/tablet de kasa olarak kullanılabilir (aynı adresle `/kasa`).
- Bilgisayarın uyku moduna girmemesi için **Sistem Ayarları → Kilit Ekranı / Enerji** ayarlarını düzenleyin.

> Uygulama yerel ağda **http** ile çalışır. Sadece dükkânın kendi (şifreli) Wi-Fi ağında kullanın; misafir ağına açmayın.

---

## 3. Barkod okuyucuyu bağlama

USB veya Bluetooth okuyucular bilgisayara **klavye gibi** bağlanır; ayrı sürücü gerekmez.

1. Okuyucuyu USB'ye takın (Bluetooth ise eşleştirin). **Klavye modu (HID)** seçili olmalıdır (çoğunda varsayılan).
2. Okuyucu her okumanın sonunda **Enter** basmalıdır. Kılavuzdaki **"Add Enter / CR suffix"** (sonek olarak Enter/CR ekle) ayar barkodunu okutun.
3. **Ayarlar → Barkod okuyucu → Okuyucu testi** alanına bir barkod okutun. "Okuyucu olarak algılanır ✓" görmelisiniz.
   - "Algılanmaz, tuş aralığını … ms yapın" derse (bazı Bluetooth okuyucular yavaştır) **Tuş aralığı** değerini önerilen sayıya çıkarıp **Ayarları kaydet**'e basın, kasa ekranını yenileyin (F5).
4. **Türkçe klavye uyarısı:** Okuyucu ABD klavye düzeninde, bilgisayar Türkçe Q düzenindeyse **harf ve semboller** yanlış gelebilir (rakamlar sorunsuzdur). Bu yüzden sistemin ürettiği dükkân içi barkodlar **sadece rakamdan** oluşur. Harf içeren üretici barkodları kullanacaksanız okuyucunun klavye dilini kılavuzdaki ayar barkoduyla **Türkçe (Turkish Q)** yapın.
5. Okuyucu bazen aynı barkodu iki kez gönderirse (çift tetikleme) sistem bunu tek sayar. Aynı ürünü bilerek tekrar okutmak ise adedi artırır.

Elinizde okuyucu yokken menüdeki **Simülatör** ile her ürünü "okutabilir", hatalı okuma ve bilinmeyen barkod senaryolarını deneyebilirsiniz.

---

## 4. Günlük kullanım

| Ekran | Ne işe yarar | Kim |
|---|---|---|
| **Kasa** | Okut → sepete ekle → NAKİT (F8) / KART (F9) → tamamla. Ürün adıyla arama da yapılabilir. | Herkes |
| **Panel** | Günün cirosu, kârı, satışları (kimin yaptığıyla), kritik stok, saatlik grafik. Satışa tıklayınca iptal/iade. **Günü Kapat**. | Yönetici |
| **İade** | Fiş numarasıyla eski bir satışı bulup kısmi/tam iade. | Yönetici |
| **Yönetim Paneli** | Aşağıdaki tüm yönetim ekranlarının toplandığı sayfa. | Yönetici |
| **Ürünler** | Ürün ekle/düzenle, barkodlar, pasife alma, stok geçmişi. **Satış fiyatına tıklayıp** fiyatı listede hızlıca değiştirme. | Yönetici |
| **Toplu fiyat güncelleme** | Bir kategoriye, seçili ürünlere veya hepsine % ya da ₺ zam/indirim; yuvarlama (0,50 / 1 ₺ / x,90); önce önizleme, maliyetin altına düşenler uyarılı. | Yönetici |
| **Kategoriler** | Kategori ekle, adını değiştir, boş kategoriyi sil. | Yönetici |
| **Mal Girişi** | Gelen malı okut → adet ve alış fiyatı → kaydet (ortalama maliyet güncellenir). | Yönetici |
| **Stok Sayımı** | Rafta sayılan adedi girin; fark gerekçesiyle kaydedilir. | Yönetici |
| **Etiketler** | A4 etiket kâğıdına barkod etiketi basma. | Yönetici |
| **Raporlar** | Günlük özet, ürün/kategori kârlılığı, düşük marjlı, satmayanlar, stok değeri + Excel. | Yönetici |
| **Ayarlar** | İşletme adı, açılış kasası, okuyucu, ses, etiket düzeni, Excel'den ürün içe aktarma, yedekler. | Yönetici |
| **İşlem geçmişi** | Kim, ne zaman, ne yaptı: fiyat değişiklikleri, iptal/iade, mal girişi, sayım, ayarlar, girişler ve hatalı giriş denemeleri. | Yönetici |
| **Kullanıcılar / Hesabım** | Kasiyer ekle/pasife al, PIN değiştir, başka yönetici ekle; kendi adınız ve şifreniz. | Yönetici |

**Kasa kısayolları:** `F2` son satırın adedi · `F8` nakit · `F9` kart · `Delete` seçili satırı sil · `Esc` sepeti temizle.

**Kârın anlamı:** Ana kâr **Brüt Kâr (KDV hariç)** = KDV hariç satış − KDV hariç maliyet. Maliyet, mal girişlerinin **ağırlıklı ortalaması**dır. Bir ürünün fiyatı sonradan değişse de eski satışların kârı değişmez.

**İptal mi, iade mi?** İptal: yanlış girilen satış hiç olmamış sayılır (sadece aynı gün). İade: ürün geri alınır, iadenin yapıldığı günün cirosundan düşülür.

**Gün sonu:** Panel → **Günü Kapat** → kasadaki parayı sayıp girin → fark gösterilir, otomatik yedek alınır. Kapalı güne satış yapılamaz; gerekirse gerekçe yazarak **Günü yeniden aç**.

**Ürünleri toplu ekleme:** Ayarlar → Excel'den içe aktar → şablonu indirin, doldurun, yükleyin, önizleyin, onaylayın.

---

## 5. Barkod etiketi yazdırma

1. **Etiketler** ekranında ürünleri ve her biri için etiket adedini seçin.
2. Etiket kâğıdınızın düzenini girin (varsayılan **3 sütun × 8 satır**, yani 70 × 37 mm etiket).
3. **Yazdır**'a basın. Yazdırma penceresinde:
   - **Ölçek: %100** (veya "Gerçek boyut") — "Sayfaya sığdır" seçmeyin.
   - **Kenar boşlukları: Yok**.
   - Kâğıt: **A4**.
4. İlk seferde etiket kâğıdı yerine **düz kâğıda** basıp etiket kâğıdının üstüne koyarak hizayı kontrol edin. Kayma varsa "Kenar boşluğu (mm)" ile ayarlayın.
5. Yarısı kullanılmış etiket kâğıdında **"İlk sayfada atla"** ile dolu etiketleri boş bırakabilirsiniz.

---

## 6. Bilgi fişi yazdırma

Satıştan sonra **Bilgi fişi yazdır** 80 mm termal yazıcıya uygun bir sayfa açar. Termal yazıcıyı bilgisayarda varsayılan yazıcı yapın; yazdırma penceresinde kâğıt boyutunu yazıcının **80 mm** rulosu seçin, kenar boşluklarını "Yok" yapın.

---

## 7. Yedekleme ve geri yükleme

Tüm veriler tek bir dosyadadır: `data/store.db`.

- **Otomatik yedek:** Her **Günü Kapat**'ta `backups/store-20261009-2130.db` gibi (tarih-saat) bir dosya oluşur.
- **Elle yedek:** Ayarlar → Yedekler → **Şimdi yedek al**, ya da Terminal'de:
  ```bash
  npm run backup
  ```
- **Önemli:** `backups` klasörünü haftada bir **USB belleğe veya buluta** (iCloud/Google Drive) kopyalayın. Bilgisayar bozulursa sadece oradaki yedek kurtarır.

**Geri yükleme (bir yedeğe dönmek):**

1. Programı durdurun (Terminal'de `Ctrl + C`).
2. `data` klasöründeki `store.db` dosyasının adını `store-eski.db` yapın; varsa `store.db-wal` ve `store.db-shm` dosyalarını silin.
3. Dönmek istediğiniz yedeği (`backups/store-….db`) `data` klasörüne kopyalayıp adını `store.db` yapın.
4. Programı tekrar başlatın (`npm run start:shop`).

---

## 8. Hesaplar: yönetici, kasiyerler, şifre sıfırlama

- **Yönetici** kullanıcı adı + şifreyle girer (giriş ekranında **Yönetici** sekmesi). İlk yönetici, programın ilk açılışında oluşturulur. Başka yönetici eklemek için: Yönetim Paneli → Kullanıcılar.
- **Kasiyerler** sadece PIN'le girer (4–8 rakam, her kasiyerin PIN'i farklı). Yönetim Paneli → **Kullanıcılar**'dan eklenir, PIN'i değiştirilir veya **pasife alınır** (işten ayrılan kasiyer artık giremez; eski satışlarında adı kalır).
- Kendi şifrenizi değiştirmek: Yönetim Paneli → **Hesabım**.
- Bir hesabın şifresi/PIN'i değişince ya da hesap pasife alınınca o hesabın açık oturumları kapanır.
- **Yönetici şifresini unuttuysanız:** klasördeki **Yönetici Şifresi Sıfırla** dosyasına çift tıklayın (ya da Terminal'de `npm run users -- reset-password`). Bu yalnızca bilgisayarın başından yapılabilir.

5 kez yanlış PIN veya şifre girilirse giriş **5 dakika** kilitlenir (tahmin edilmesini zorlaştırmak için). Şifreler ve PIN'ler veritabanında açık halde değil, geri çözülemeyen şekilde (scrypt) saklanır.

---

## 9. Gerçek kullanıma geçiş (örnek verileri silme)

1. Programı durdurun ve isterseniz bir yedek alın (`npm run backup`).
2. `data` klasöründeki `store.db`, `store.db-wal`, `store.db-shm` dosyalarını silin.
3. Programı başlatın: boş bir veritabanı otomatik oluşur ve **yönetici hesabı oluşturma** ekranı gelir (kasiyerleri yeniden eklemeniz gerekir).
4. **Ayarlar**'dan işletme adını ve açılış kasasını girin; ürünleri **Ayarlar → Excel'den içe aktar** ile veya **Ürünler → Yeni ürün** ile ekleyin. Barkodu olmayan ürünlere **Etiketler**'den barkod basın.

---

## 10. Bilinen sınırlar ve sonraki adımlar

**Bu sürümde yok:** e-fatura/e-arşiv, yazar kasa (ÖKC) bağlantısı, tartılı ürünler (kg), çoklu şube, müşteri/sadakat programı.

**Bilinmesi gerekenler:**
- Program tek bilgisayarda çalışır; diğer cihazlar (telefon, ikinci kasa) aynı Wi-Fi'den bu bilgisayara bağlanır. Bilgisayar kapalıyken sistem kapalıdır.
- Program yerel ağda http ile çalışır; dükkân dışı ağlara (internete) açmayın.
- Okuyucu hızı eşiği (varsayılan 50 ms) çok yavaş okuyucularda artırılmalıdır (bkz. Bölüm 3).

**Önerilen sonraki adımlar:**
- **Buluta taşıma (Supabase / PostgreSQL):** Tüm veritabanı sorguları tek katmanda (`src/server/db/repositories/`) toplandı. Taşırken bu katman ve servis fonksiyonlarının asenkron hale getirilmesi gerekir; hesap kuralları değişmez. Böylece dükkân dışından da panel görülebilir.
- Tartılı ürün (terazi barkodu), otomatik bulut yedeği.

---

## 11. Teknik bilgiler (geliştirici için)

Next.js 16 (App Router) · TypeScript · Tailwind · SQLite (better-sqlite3) · Zod · bwip-js · exceljs · Recharts · Vitest · Playwright.
İş kuralları ve mimari notları: **`CLAUDE.md`**.

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` / `npm run start` / `npm run start:shop` | Üretim derlemesi / başlatma / ağa açık başlatma |
| `npm run lint` · `npm run typecheck` | Kod denetimi |
| `npm test` | Birim + entegrasyon testleri (bellek içi SQLite) |
| `npm run test:e2e` | Uçtan uca testler (Playwright; ayrı veritabanı `data/e2e/`) |
| `npm run seed` | Örnek veri (veritabanını sıfırlar, önce yedek alır) |
| `npm run backup` | Anlık yedek |
| `npm run check:integrity` | Her ürün için stok = stok hareketleri toplamı kontrolü |
| `docs/kilavuz/` · `promo/` | Kullanma kılavuzu PDF'ini ve tanıtım videosunu yeniden üreten betikler (açıklamalar klasörlerdeki README'lerde) |
| `npm run users -- reset-password` · `create-owner <kullanıcı> <şifre> [ad]` · `create-cashier <ad> <pin>` · `list` | Hesap işlemleri (bilgisayardan) |
