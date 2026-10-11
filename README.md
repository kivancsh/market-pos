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
   - [E-posta (isteğe bağlı): şifre sıfırlama ve günlük rapor](#e-posta-isteğe-bağlı-şifre-sıfırlama-ve-günlük-rapor)
9. [Gerçek kullanıma geçiş (örnek verileri silme)](#9-gerçek-kullanıma-geçiş-örnek-verileri-silme)
10. [Bilinen sınırlar ve sonraki adımlar](#10-bilinen-sınırlar-ve-sonraki-adımlar)
11. [Teknik bilgiler (geliştirici için)](#11-teknik-bilgiler-geliştirici-için)

---

## Kullanma kılavuzu (PDF)

📘 **[Market Kasa Kullanma Kılavuzu (PDF, 65 sayfa)](docs/Market%20Kasa%20Kullanma%20K%C4%B1lavuzu.pdf)**

Bilgisayardan anlamayan biri için yazılmış, resimli ve adım adım anlatım. Her ekran görüntüsünün üzerinde kırmızı numaralar, altında "burası ne işe yarar" açıklaması vardır.

- Mac'e ve **Windows'a kurulum** (uyarı penceresi, kurulum yardımcısı, Başlat menüsü, bilgilerin yeri), programı açıp kapatma, ilk kurulum (tek adım), giriş (Kasiyer No + PIN, Şifremi unuttum)
- **Satış:** okutma, adet, adla arama, nakit/kart, para üstü, bilgi fişi, indirim, bilinmeyen barkod, kısayollar, kasa mesajları
- Ürün ekleme, Excel'den aktarma, fiyat değiştirme (tek ürün ve toplu), kategoriler, barkod etiketi
- Mal girişi, stok sayımı, iade ve iptal, panel, gün sonu ve **günlük rapor e-postası**, raporlar, telefondan takip
- **Yönetici Paneli:** menü, Genel bakış, **kasiyer performansı**, **giderler ve kâr-zarar** (net kâr, KDV özeti), **analizler** (yoğun saatler, ABC, sipariş önerisi)
- Kasiyer hesapları ve numaraları, şifre/PIN değiştirme, isteğe bağlı e-posta (Gmail uygulama şifresi), işlem geçmişi, ayarlar, barkod okuyucu, yedekleme
- Sorun çözme tablosu, kelimelerin anlamı ve kasanın yanına asılacak **günlük kullanım özeti**

Kılavuzu yeniden üretmek (ekranlar değişince): [`docs/kilavuz/README.md`](docs/kilavuz/README.md).

## Tanıtım videosu

🎬 **[Market Kasa tanıtım videosu (45 sn, 1080p, müzikli)](promo/market-kasa-tanitim.mp4)**

Tempolu reklam filmi: "Dükkânınızda hâlâ verimsiz satış, dağınık ekip yönetimi, plansız büyüme… artık değil." → hızlı satış (barkod, para üstü) → **finans yönetimi** (ciro, brüt kâr, giderler, net kâr, kâr-zarar ve KDV) → **iş takibi** (kasiyer performansı, yoğun saatler) → **stok** (bitmeden haber, sipariş önerisi) → etiket, Excel, telefondan takip, gün sonu e-postası, işlem geçmişi. Müzikte akılda kalan 4 notalık bir "sonik logo" tekrar eder. Ekranlar uygulamanın gerçek ekranlarıdır; müzik ve efektler bu proje için sentezlendi (telifsiz).

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

### Güncelleme (Windows ve Mac)

- Her yayında **sürüm numarası** kendiliğinden artar: `1.1.<derleme no>` (ilk iki sayı `package.json`'dan). Çalışan sürüm **Ayarlar → Program sürümü ve güncelleme**'de yazar.
- Program açılıştan kısa süre sonra ve **6 saatte bir** GitHub'daki en son sürüme bakar. Yeni sürüm varsa yöneticiye yeşil bir şerit çıkar: "Yeni sürüm var".
- **Ayarlar → Güncelle**: önce **otomatik yedek** alınır, yeni kurulum dosyası indirilir ve boyutu + parmak izi (SHA-256) doğrulanır. Sonra pencere kapanır, kurulum sessizce yapılır ve program 1–2 dakika içinde **kendiliğinden yeniden açılır**. Bilgiler yerinde kalır; veritabanı değişikliği gerekiyorsa ilk açılışta otomatik yapılır.
- Güncelleme **kendiliğinden kurulmaz**; satış sırasında program kapanmasın diye yönetici düğmeye basınca yapılır. Kasiyerler bildirimi görmez.
- Windows'ta Güncelle düğmesi yalnızca kasa bilgisayarındaki **Market Kasa penceresinde** çalışır (telefonda/tarayıcıda ne yapılacağı yazar).
- **Mac**'te (GitHub'dan indirilen `Market-Kasa-Mac.zip` kurulumu) aynı düğme: yedek → Mac paketi indirilip doğrulanır → program birkaç dakika kapanır, yeni sürüm kurulup derlenir ve başlatılır; sayfa kendiliğinden yenilenir. Bir adım başarısız olursa **eski sürüme kendiliğinden geri dönülür** ve Ayarlar'da nedeni yazar (ayrıntı: `data/updates/update.log`). Bilgiler (`data/`, `backups/`, `.env`) hiç değişmez.
- Geliştirme kopyasında (git ile alınmış klasör) güncelleme denetlenmez; orada kod doğrudan değişir.
- Sürüm notu olarak kod gönderiminin başlığı gösterilir.
- Bu özellikten **önceki** sürümleri kullananlar bir kereliğine yeni Setup.exe'yi indirip kurmalıdır; sonrakiler programın içinden güncellenir.

---

## Kolay kurulum: masaüstü simgesi (Mac)

🍎 **[Market-Kasa-Mac.zip'i indir (en son sürüm)](https://github.com/kivancsh/market-pos/releases/latest/download/Market-Kasa-Mac.zip)** — açınca `market-pos` klasörü çıkar.

> **Klasörü nereye koymalı?** Kullanıcı klasörünüze (Finder → Git → Ana Klasör). iCloud'da "Masaüstü ve Belgeler" eşitlemesi açıksa klasörü **Masaüstü'ne veya Belgeler'e koymayın**: satış bilgilerinin tutulduğu veritabanı eşitleme sırasında bozulabilir ve program yavaşlar. Kurulum böyle bir yerde çalıştırılırsa uyarır.

1. Klasördeki **Kurulum** dosyasına çift tıklayın (ilk seferde macOS "doğrulanamadı" derse: dosyaya sağ tıklayın → **Aç** → **Aç**). Eksikleri tamamlar (paketler, ayar dosyası, derleme) ve **masaüstüne "Market Kasa" uygulama simgesini** koyar. (Node.js kurulu değilse indirme sayfasını açar; kurduktan sonra tekrar çift tıklayın.)
2. Programı açmak için masaüstündeki **Market Kasa** simgesine çift tıklayın. Program **kendi penceresinde** açılır (tarayıcı gerekmez; adres çubuğu/sekme yok, Dock'ta kendi simgesi). Sunucu arka planda çalışır. Simgeyi Dock'a da sürükleyebilirsiniz.
3. Pencerenin üst menüsü: **Market Kasa** (Telefondan bağlanma, Tarayıcıda aç, Programı tamamen kapat) · **Dosya** (Yazdır ⌘P) · **Görünüm** (Yenile ⌘R, Yakınlaştır/Uzaklaştır) · **Git** (Kasa ⌘1, Panel ⌘2, Yönetici Paneli ⌘3). Bilgi fişi ayrı küçük pencerede açılıp yazdırılır; Excel raporları İndirilenler klasörüne iner.
4. **İlk açılışta** tek adımlık kurulum ekranı gelir: adınızı, kullanıcı adınızı ve en az 8 karakterlik şifrenizi yazıp **Hesabı oluştur**'a basın; hesap hemen açılır. E-posta isteğe bağlıdır (bkz. [E-posta](#e-posta-isteğe-bağlı-şifre-sıfırlama-ve-günlük-rapor)). Sonra **Yönetici Paneli → Kullanıcılar**'dan kasiyerleri (ad + PIN) ekleyin; her kasiyere otomatik bir **Kasiyer No** verilir (1001, 1002…).
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
cd ~/market-pos
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
| **Yönetici Paneli** | Yöneticinin giriş sayfası. Solda menü (telefonda üstte **☰ Yönetici menüsü**), açılışta **Genel bakış**: bugün / bu hafta / bu ay ciro, brüt kâr, giderler, net kâr, marj, satış sayısı, ortalama sepet, iadeler (önceki döneme göre), son 30 gün grafiği, kasiyerler, stok uyarıları, son işlemler. | Yönetici |
| **Kasiyer performansı** | Her kasiyerin satış sayısı ve tutarı, nakit/kart, ortalama sepet, satılan ürün, iptal ve iadeleri, kasada geçen süre ve saat başı satışı; tarih aralığı + Excel. Gün sonu e-postasında da gelir. | Yönetici |
| **Kâr-zarar** | Bu ay / geçen ay / bu yıl ya da istenen aralık: net satış − maliyet = brüt kâr; − giderler = **net kâr**. KDV özeti (satış KDV − alış KDV − gider KDV), gider dağılımı, son 12 ay tablosu, Excel. | Yönetici |
| **Giderler** | Kira, elektrik, su, maaş, vergi vb. giderleri tarih, kategori, tutar (KDV dahil) ve KDV oranıyla girme, düzeltme, silme. | Yönetici |
| **Analizler** | Son 30/90 gün: haftalık ciro, en yoğun gün ve saatler (ısı haritası), ABC analizi (cironun %80'ini getiren ürünler), stok kaç gün yeter ve **sipariş önerisi**. | Yönetici |
| **Ürünler** | Ürün ekle/düzenle, barkodlar, pasife alma, stok geçmişi. **Satış fiyatına tıklayıp** fiyatı listede hızlıca değiştirme. | Yönetici |
| **Toplu fiyat güncelleme** | Bir kategoriye, seçili ürünlere veya hepsine % ya da ₺ zam/indirim; yuvarlama (0,50 / 1 ₺ / x,90); önce önizleme, maliyetin altına düşenler uyarılı. | Yönetici |
| **Kategoriler** | Kategori ekle, adını değiştir, boş kategoriyi sil. | Yönetici |
| **Mal Girişi** | Gelen malı okut → adet ve alış fiyatı → kaydet (ortalama maliyet güncellenir). | Yönetici |
| **Stok Sayımı** | Rafta sayılan adedi girin; fark gerekçesiyle kaydedilir. | Yönetici |
| **Etiketler** | A4 etiket kâğıdına barkod etiketi basma. | Yönetici |
| **Raporlar** | Günlük özet, kasiyer performansı, kâr-zarar, giderler, sipariş önerisi, ürün/kategori kârlılığı, düşük marjlı, satmayanlar, stok değeri + Excel. | Yönetici |
| **Ayarlar** | İşletme adı, açılış kasası, okuyucu, ses, etiket düzeni, günlük rapor e-postası ve saati, e-posta gönderim hesabı, Excel'den ürün içe aktarma, yedekler. | Yönetici |
| **İşlem geçmişi** | Kim, ne zaman, ne yaptı: fiyat değişiklikleri, iptal/iade, mal girişi, sayım, ayarlar, girişler ve hatalı giriş denemeleri. | Yönetici |
| **Kullanıcılar / Hesabım** | Kasiyer ekle (Kasiyer No otomatik)/pasife al, PIN değiştir (e-posta kodlu), başka yönetici ekle; kendi adınız, e-postanız ve şifreniz. | Yönetici |

**Kasa kısayolları:** `F2` son satırın adedi · `F8` nakit · `F9` kart · `Delete` seçili satırı sil · `Esc` sepeti temizle.

**Kârın anlamı:** Ana kâr **Brüt Kâr (KDV hariç)** = KDV hariç satış − KDV hariç maliyet. Maliyet, mal girişlerinin **ağırlıklı ortalaması**dır. Bir ürünün fiyatı sonradan değişse de eski satışların kârı değişmez.

**İptal mi, iade mi?** İptal: yanlış girilen satış hiç olmamış sayılır (sadece aynı gün). İade: ürün geri alınır, iadenin yapıldığı günün cirosundan düşülür.

**Gün sonu:** Panel → **Günü Kapat** → kasadaki parayı sayıp girin → fark gösterilir, otomatik yedek alınır ve **günün raporu yöneticilerin e-postasına gider**. Kapalı güne satış yapılamaz; gerekirse gerekçe yazarak **Günü yeniden aç**.

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

- **Yönetici** kullanıcı adı + şifreyle girer (giriş ekranında **Yönetici** sekmesi). İlk yönetici, programın ilk açılışında oluşturulur. Başka yönetici eklemek için: Yönetici Paneli → Kullanıcılar.
- **Kasiyerler** kendi **Kasiyer No**'ları + PIN'leriyle girer (giriş ekranı **Kasiyer** sekmesiyle açılır). Kasiyer No otomatik verilir (1001, 1002…), her kasiyerin kendi numarası ve hesabı vardır; numara bir daha başkasına verilmez. PIN 4–8 rakamdır ve her kasiyerinki farklıdır. Yönetici Paneli → **Kullanıcılar**'dan eklenir, PIN'i değiştirilir veya **pasife alınır** (işten ayrılan kasiyer artık giremez; eski satışlarında adı kalır). Program o bilgisayarda en son giren Kasiyer No'yu hatırlar.
- **Şifre ve PIN'leri sadece yönetici değiştirir/sıfırlar** (kasiyerlerinki dahil). E-posta bağlı değilse doğrudan değişir (yönetici kendi şifresinde mevcut şifresini de yazar). E-posta bağlıysa her seferinde yöneticinin e-postasına **6 haneli onay kodu** gider; kod doğru girilmeden değişiklik yapılmaz (10 dakika geçerli, 5 yanlışta iptal).
- Kendi şifrenizi veya e-postanızı değiştirmek: Yönetici Paneli → **Hesabım** (e-posta eklerken adrese kod gider).
- Bir hesabın şifresi/PIN'i değişince ya da hesap pasife alınınca o hesabın açık oturumları kapanır.
- **Yönetici şifresini unuttuysanız:** kasa bilgisayarında **Yönetici Şifresi Sıfırla** (Windows: Başlat menüsü → Market Kasa; Mac: klasördeki dosya; ya da Terminal'de `npm run users -- reset-password`). E-posta bağladıysanız giriş ekranı → **Yönetici** → **Şifremi unuttum** ile e-postanıza gelen kodla da yenileyebilirsiniz.

5 kez yanlış PIN veya şifre girilirse giriş **5 dakika** kilitlenir (tahmin edilmesini zorlaştırmak için). Şifreler ve PIN'ler veritabanında açık halde değil, geri çözülemeyen şekilde (scrypt) saklanır.

### E-posta (isteğe bağlı): şifre sıfırlama ve günlük rapor

Program e-postasız da tam çalışır. **Market Kasa e-posta servisi** açıldığında (kurulumu: [mail-service/README.md](mail-service/README.md)) bağlamak çok kolaydır: Ayarlar → **E-posta bağla** → sadece e-posta adresinizi yazın → gelen 6 haneli kodu girin; rapor ve kodlar "Market Kasa" adına gelir. Servis açık değilse (ya da **Kendi Gmail hesabımla göndereyim (gelişmiş)** seçilirse) aşağıdaki yol kullanılır. **Ayarlar → E-posta gönderimi → E-posta bağla** ile bağlarsanız: şifrenizi e-postayla yenileyebilir, her akşam günlük raporu alırsınız; şifre/PIN değişiklikleri de e-posta koduyla yapılır. Ardından Yönetici Paneli → **Hesabım**'dan kendi e-posta adresinizi ekleyin (adrese kod gelir). E-postalar **dükkânın kendi e-posta hesabından** gönderilir. Gmail önerilir (iCloud, Yandex ve diğer SMTP hesapları da seçilebilir). **Outlook / Hotmail gönderen olarak kullanılamaz:** Microsoft 2026'dan beri programların şifreyle e-posta göndermesine izin vermiyor. Hotmail adresiniz yine **alıcı** olabilir (kodlar ve rapor oraya gelir); gönderen için bir Gmail hesabı açın. Gmail'in normal şifresi burada çalışmaz; bir kerelik **uygulama şifresi** alınır:

1. **myaccount.google.com** → **Güvenlik** → **2 Adımlı Doğrulama**'yı açın (kapalıysa).
2. Arama kutusuna **Uygulama şifreleri** yazın → ad olarak **Market Kasa** → **Oluştur**.
3. Çıkan 16 harfli şifreyi **Ayarlar → E-posta gönderimi → E-posta bağla** (ya da Hesabı değiştir) ekranına yazın. Program bağlanmayı hemen dener; hata varsa Türkçe açıklar.

Şifre veritabanında şifrelenmiş olarak saklanır. **Ayarlar → E-posta gönderimi**'nden deneme e-postası gönderebilir, **Bugünün raporunu şimdi gönder**'e basabilirsiniz.

**Günlük rapor:** Günü Kapat'ta hemen; gün kapatılmazsa Ayarlar'daki saatte (varsayılan 23:30) gider. O saatte bilgisayar kapalıysa ertesi açılışta dünün raporu gönderilir. Hiç satış/iade olmayan günlerde rapor gönderilmez. Rapor; ciro, kâr, marj, ödeme türleri, iadeler, kasa sayımı ve en çok satan ürünleri içerir, ekinde ürün kârlılığı Excel dosyası vardır. Alıcılar: e-posta adresi olan tüm aktif yöneticiler. Ayarlar'dan kapatılabilir.


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
| `npm run users -- reset-password` · `create-owner <kullanıcı> <şifre> [--email=adres] [ad]` · `create-cashier <ad> <pin>` · `list` | Hesap işlemleri (bilgisayardan) |
