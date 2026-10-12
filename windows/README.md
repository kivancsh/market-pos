# Windows kurulum paketi

Arkadaşınızın / dükkânın **Windows** bilgisayarına klasik bir kurulum dosyasıyla kurmak için.

**İndir:** [Optiva-Setup.exe (en son sürüm)](https://github.com/kivancsh/market-pos/releases/latest/download/Optiva-Setup.exe) — kurulum adımları: [RELEASE_NOTES.md](RELEASE_NOTES.md)

## Nasıl üretiliyor?

`main` dalına her kod gönderiminde GitHub Actions ([`.github/workflows/windows-installer.yml`](../.github/workflows/windows-installer.yml)) GitHub'ın Windows bilgisayarında şunları yapar:

1. Paketleri kurar ve bütün testleri **Windows'ta** çalıştırır.
2. Uygulamayı kendi kendine yeten sunucu olarak derler (`NEXT_OUTPUT=standalone`).
3. `windows/build.mjs` ile dosyaları toplar: sunucu, Node.js (`node.exe`), veritabanı şeması, şifre sıfırlama ve yedek araçları. Veritabanı, yedek ve `.env` gibi kişisel dosyalar pakete giremez (betik kontrol eder).
4. Başlatıcıyı (`Optiva.exe`, `launcher/MarketKasa.cs`) Windows'un kendi C# derleyicisiyle derler.
5. Inno Setup ile `Optiva-Setup.exe`'yi oluşturur (`installer.iss`).
6. **Gerçek kurulum testi** (`smoke-test.ps1`): sessiz kurar, açar, tek adımda yönetici hesabı, Kasiyer No'lu kasiyer (PIN'i e-postasız değiştirir) ve ürün oluşturur, satış yapar, sayfaları, barkodu, Excel'i ve yedeği dener, kapatıp yeniden açar, kaldırır ve bilgilerin silinmediğini doğrular.
   Güncellemeyi de dener: yerel deneme sunucusu (`smoke-update-server.js`) "99.0.0" sürümünü sunar; program yeni sürümü görür, yedek alıp
   indirir, parmak izini doğrular, `Optiva.exe --install-update` sessiz kurulumu başlatır ve program yeniden açılınca bilgilerin yerinde olduğu kontrol edilir.
7. Hepsi geçerse kurulum dosyasını ve **`latest.json`**'u (sürüm, boyut, SHA-256 — `write-latest.mjs`) **Releases** sayfasında "en son sürüm" olarak yayınlar.
   Kurulu programlar yeni sürümü bu dosyadan öğrenir.

Sürüm numarası: `package.json`'daki ilk iki sayı + GitHub derleme numarası (ör. `1.1.57`); `build/win/app/version.json`'a ve kurulum dosyasına yazılır.

Elle çalıştırmak için: GitHub → **Actions** → **Windows kurulum dosyası** → **Run workflow**.

## Windows'ta neler kurulur?

| Yer | İçerik |
|---|---|
| `%LOCALAPPDATA%\Programs\Optiva` | Program dosyaları (güncellemede yenilenir) |
| `%LOCALAPPDATA%\Optiva\data` | Veritabanı (`store.db`) — kaldırırken **silinmez** |
| `%LOCALAPPDATA%\Optiva\backups` | Yedekler (gün sonu, Yedek Al) |
| `%LOCALAPPDATA%\Optiva\logs` | `server.log`, `launcher.log` (sorun ararken) |
| `%LOCALAPPDATA%\Optiva\updates` | İndirilen güncelleme (kurulunca bir sonraki açılışta silinir) |
| Masaüstü + Başlat menüsü | Optiva, Yedek Al, Yedekler klasörü, Yönetici Şifresi Sıfırla, Kaldır |

`Optiva.exe` programı **kendi penceresinde** açar (Microsoft Edge WebView2; DLL'ler exe'nin yanında, NuGet'ten CI'da indirilir). WebView2 yoksa varsayılan tarayıcıya düşer.

Komutlar: `--start` (başlat ve hazır olmasını bekle), `--stop` (durdur), `--status` (çalışıyorsa 0), `--selftest` (pencereyi görünmeden açıp sayfanın yüklendiğini dener).
