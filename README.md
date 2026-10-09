# Market Kasa

Küçük bir dükkân için **barkodlu satış, stok ve kârlılık takip** sistemi.
Barkod okuyucuyla satış yapılır, stok kendiliğinden düşer, gün içinde ve gün sonunda ciro, kâr ve stok durumu görülür.

> **Önemli:** Bu sistem **iç takip** içindir. Yasal fiş yine yazar kasadan (ÖKC) kesilir.
> Bu programın yazdırdığı fişte "Bilgi fişidir, mali değeri yoktur." yazar.

---

## İçindekiler

1. [İlk kurulum](#1-ilk-kurulum)
2. [Dükkânda çalıştırma ve telefondan erişim](#2-dükkânda-çalıştırma-ve-telefondan-erişim)
3. [Barkod okuyucuyu bağlama](#3-barkod-okuyucuyu-bağlama)
4. [Günlük kullanım](#4-günlük-kullanım)
5. [Barkod etiketi yazdırma](#5-barkod-etiketi-yazdırma)
6. [Bilgi fişi yazdırma](#6-bilgi-fişi-yazdırma)
7. [Yedekleme ve geri yükleme](#7-yedekleme-ve-geri-yükleme)
8. [PIN değiştirme](#8-pin-değiştirme)
9. [Gerçek kullanıma geçiş (örnek verileri silme)](#9-gerçek-kullanıma-geçiş-örnek-verileri-silme)
10. [Bilinen sınırlar ve sonraki adımlar](#10-bilinen-sınırlar-ve-sonraki-adımlar)
11. [Teknik bilgiler (geliştirici için)](#11-teknik-bilgiler-geliştirici-için)

---

## Kolay kurulum: masaüstü simgesi (Mac)

1. Klasördeki **Kurulum** dosyasına çift tıklayın. Eksikleri tamamlar (paketler, PIN dosyası, derleme) ve **masaüstüne "Market Kasa" uygulama simgesini** koyar. (Node.js kurulu değilse indirme sayfasını açar; kurduktan sonra tekrar çift tıklayın.)
2. Programı açmak için masaüstündeki **Market Kasa** simgesine çift tıklayın. Program **arka planda, pencere açmadan** çalışır ve tarayıcı açılır. Simgeyi Dock'a da sürükleyebilirsiniz.
3. Program açıkken simgeye tekrar tıklarsanız küçük bir pencere çıkar:
   - **Tarayıcıda aç** — kasa/panel sayfasını açar,
   - **Programı kapat** — onay sorduktan sonra programı durdurur.
   Bu pencerede telefondan panel adresi de yazar.
4. Tarayıcı sekmesini kapatmak programı kapatmaz. Program; simgeden "Programı kapat" denene ya da bilgisayar kapanana/yeniden başlayana kadar çalışır. Bilgisayarı açtıktan sonra simgeye bir kez tıklamanız yeterlidir.

Klasördeki diğer çift tıklanabilir dosyalar:

| Dosya | Ne yapar |
|---|---|
| **PIN Ayarla** | PIN dosyasını (`.env`) TextEdit'te açar. Kaydedip (⌘ + S) programı yeniden başlatın (simge → Programı kapat → simge). |
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

Ardından `.env` dosyasını bir metin düzenleyiciyle açıp PIN'leri değiştirin (bkz. [PIN değiştirme](#8-pin-değiştirme)).
`.env` hiç oluşturulmazsa varsayılan PIN'ler kullanılır (yönetici **1234**, kasiyer **0000**) ve ekranda uyarı görünür.

### 1.4 Örnek veriler (isteğe bağlı, denemek için)

```bash
npm run seed
```

27 örnek ürün, barkodları ve son 14 günün satışları oluşur. Barkod listesi `data/seed-barcodes.csv` dosyasına yazılır (Excel'de açılabilir).

> ⚠️ `npm run seed` veritabanını **sıfırlar**. İçinde satış varsa silmeden önce `backups/` klasörüne otomatik yedek alır.

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
  2. Telefonun tarayıcısında **http://192.168.1.34:3000/panel** adresini açın, yönetici PIN'iyle girin.
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
| **Panel** | Günün cirosu, kârı, satışları, kritik stok, saatlik grafik. Satışa tıklayınca iptal/iade. **Günü Kapat**. | Yönetici |
| **İade** | Fiş numarasıyla eski bir satışı bulup kısmi/tam iade. | Yönetici |
| **Ürünler** | Ürün ekle/düzenle, barkodlar, pasife alma, stok geçmişi. | Yönetici |
| **Mal Girişi** | Gelen malı okut → adet ve alış fiyatı → kaydet (ortalama maliyet güncellenir). | Yönetici |
| **Stok Sayımı** | Rafta sayılan adedi girin; fark gerekçesiyle kaydedilir. | Yönetici |
| **Etiketler** | A4 etiket kâğıdına barkod etiketi basma. | Yönetici |
| **Raporlar** | Günlük özet, ürün/kategori kârlılığı, düşük marjlı, satmayanlar, stok değeri + Excel. | Yönetici |
| **Ayarlar** | İşletme adı, açılış kasası, okuyucu, ses, etiket düzeni, Excel'den ürün içe aktarma, yedekler. | Yönetici |

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

## 8. PIN değiştirme

1. Programı durdurun.
2. `.env` dosyasını açın ve değiştirin (4–8 rakam, ikisi farklı olmalı):
   ```
   OWNER_PIN=7391
   CASHIER_PIN=2846
   ```
3. Programı tekrar başlatın. Varsayılan PIN uyarısı kaybolur.

5 kez yanlış PIN girilirse giriş **5 dakika** kilitlenir (tahmin edilmesini zorlaştırmak için).

---

## 9. Gerçek kullanıma geçiş (örnek verileri silme)

1. Programı durdurun ve isterseniz bir yedek alın (`npm run backup`).
2. `data` klasöründeki `store.db`, `store.db-wal`, `store.db-shm` dosyalarını silin.
3. Programı başlatın: boş bir veritabanı otomatik oluşur.
4. **Ayarlar**'dan işletme adını ve açılış kasasını girin; ürünleri **Ayarlar → Excel'den içe aktar** ile veya **Ürünler → Yeni ürün** ile ekleyin. Barkodu olmayan ürünlere **Etiketler**'den barkod basın.

---

## 10. Bilinen sınırlar ve sonraki adımlar

**Bu sürümde yok:** e-fatura/e-arşiv, yazar kasa (ÖKC) bağlantısı, tartılı ürünler (kg), çoklu şube, müşteri/sadakat programı.

**Bilinmesi gerekenler:**
- Program tek bilgisayarda çalışır; diğer cihazlar (telefon, ikinci kasa) aynı Wi-Fi'den bu bilgisayara bağlanır. Bilgisayar kapalıyken sistem kapalıdır.
- Kimlik doğrulama yalnızca PIN'dir; dükkân dışı ağlara açmayın.
- Okuyucu hızı eşiği (varsayılan 50 ms) çok yavaş okuyucularda artırılmalıdır (bkz. Bölüm 3).

**Önerilen sonraki adımlar:**
- **Buluta taşıma (Supabase / PostgreSQL):** Tüm veritabanı sorguları tek katmanda (`src/server/db/repositories/`) toplandı. Taşırken bu katman ve servis fonksiyonlarının asenkron hale getirilmesi gerekir; hesap kuralları değişmez. Böylece dükkân dışından da panel görülebilir.
- Birden fazla kasa için kasa/kullanıcı adı kaydı, tartılı ürün (terazi barkodu), otomatik bulut yedeği.

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
