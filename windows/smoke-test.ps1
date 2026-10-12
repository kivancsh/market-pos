# Optiva — Windows kurulum testi (GitHub Actions'ta, gerçek Windows'ta çalışır).
# Kur → başlat → hesap aç → sayfaları/raporu/yedeği dene → durdur → yeniden başlat (veri kalıcı mı?) → kaldır (veri kalıyor mu?)
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3000'
$root = Join-Path $env:LOCALAPPDATA 'Optiva'
$appDir = Join-Path $env:LOCALAPPDATA 'Programs\Optiva'
$exe = Join-Path $appDir 'Optiva.exe'

function Step($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Fail($m) {
  Write-Host "HATA: $m" -ForegroundColor Red
  $detail = ''
  foreach ($f in @('server.log', 'launcher.log')) {
    $p = Join-Path $root "logs\$f"
    if (Test-Path $p) { $t = (Get-Content $p -Tail 40) -join ' | '; Write-Host "--- $f"; Write-Host $t; $detail += " [$f] $t" }
  }
  # GitHub'da "annotation" olarak görünür (kayıtları okumak için giriş gerekmez)
  Write-Host "::error::KURULUM TESTI: $m$detail"
  exit 1
}
# Start-Process -Wait, başlatılan programın ALT süreçlerini de bekler (arka plandaki sunucu hiç kapanmaz);
# bu yüzden sadece programın kendisini bekleyen .NET Process kullanılır.
function RunExe($file, $argList, $timeoutSec = 300) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo ([string]$file)
  $psi.Arguments = ($argList -join ' ')
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  if (-not $p.WaitForExit($timeoutSec * 1000)) { Fail "$file $($psi.Arguments) $timeoutSec sn içinde bitmedi" }
  return $p.ExitCode
}

Step 'Ad değişikliği hazırlığı: eski "Market Kasa" bilgi klasörü (önceki sürümden kalmış gibi)'
$legacy = Join-Path $env:LOCALAPPDATA 'Market Kasa'
New-Item -ItemType Directory -Force (Join-Path $legacy 'backups') | Out-Null
Set-Content (Join-Path $legacy 'backups\eski-surum-isareti.txt') 'eski sürümden' -Encoding utf8

Step 'Kurulum (sessiz)'
$setup = Resolve-Path 'build\dist\Optiva-Setup.exe'
$code = RunExe $setup @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/TASKS=desktopicon')
if ($code -ne 0) { Fail "Kurulum çıkış kodu $code" }
foreach ($f in @($exe, "$appDir\node\node.exe", "$appDir\app\server.js", "$appDir\app\kasa-server.js", "$appDir\app\tools\users-cli.js", "$appDir\unins000.exe", "$appDir\Microsoft.Web.WebView2.Core.dll", "$appDir\Microsoft.Web.WebView2.WinForms.dll", "$appDir\WebView2Loader.dll")) {
  if (-not (Test-Path $f)) { Fail "Kurulumdan sonra eksik: $f" }
}
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path (Join-Path $desktop 'Optiva.lnk'))) { Fail 'Masaüstü kısayolu yok' }
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Optiva'
foreach ($l in @('Optiva.lnk', 'Yönetici Şifresi Sıfırla.lnk', 'Yedek Al.lnk')) {
  if (-not (Test-Path (Join-Path $startMenu $l))) { Fail "Başlat menüsünde eksik kısayol: $l" }
}
Get-ChildItem -Recurse $appDir -Include *.db, *.sqlite, session-secret, .env* | ForEach-Object { Fail "Pakette kişisel dosya var: $($_.FullName)" }

Step 'Başlatma'
# Test: e-postalar gönderilmez, bu klasöre yazılır (başlatıcı ortam değişkenini sunucuya geçirir)
$env:MAIL_DEV_DIR = Join-Path ([IO.Path]::GetTempPath()) 'market-kasa-mail'
Remove-Item -Recurse -Force $env:MAIL_DEV_DIR -ErrorAction SilentlyContinue
# Test: GitHub yerine yerel deneme sunucusu "99.0.0" sürümünü sunar (aynı kurulum dosyası; parmak izi gerçek)
$updSite = Join-Path ([IO.Path]::GetTempPath()) 'market-kasa-update-site'
Remove-Item -Recurse -Force $updSite -ErrorAction SilentlyContinue
New-Item -ItemType Directory $updSite | Out-Null
Copy-Item $setup (Join-Path $updSite 'Optiva-Setup.exe')
$updSha = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLower()
@{ version = '99.0.0'; sha256 = $updSha; size = (Get-Item $setup).Length; notes = 'Deneme güncellemesi' } | ConvertTo-Json |
  Set-Content (Join-Path $updSite 'latest.json') -Encoding utf8
$updServer = Start-Process node -ArgumentList @((Resolve-Path 'windows\smoke-update-server.js').Path, $updSite, '8790') -PassThru -WindowStyle Hidden
$env:MARKET_KASA_UPDATE_BASE = 'http://127.0.0.1:8790'
$code = RunExe $exe @('--start')
if ($code -ne 0) { Fail "Başlatıcı --start çıkış kodu $code" }
if ((RunExe $exe @('--status')) -ne 0) { Fail '--status çalışmıyor diyor' }
# Eski "Market Kasa" klasörü bütün hâlinde Optiva'ya taşınmış olmalı (veri kaybı yok)
if (Test-Path $legacy) { Fail 'Eski Market Kasa klasörü taşınmadı' }
if (-not (Test-Path (Join-Path $root 'backups\eski-surum-isareti.txt'))) { Fail 'Eski klasördeki dosya Optiva klasörüne gelmedi' }
$me = Invoke-RestMethod "$base/api/auth/me"
if (-not $me.needsSetup) { Fail 'İlk açılışta kurulum ekranı bekleniyordu' }
$r = Invoke-WebRequest "$base/" -MaximumRedirection 5 -UseBasicParsing
if ($r.Content -notmatch 'Yönetici hesabı') { Fail 'Kurulum sayfası gelmedi' }

Step 'Uygulama penceresi (WebView2): pencereyi görünmeden açıp sayfayı yükle'
$code = RunExe $exe @('--selftest') 150
$ll = Join-Path $root 'logs\launcher.log'
$tail = if (Test-Path $ll) { (Get-Content $ll -Tail 6) -join ' | ' } else { '' }
if ($code -eq 0) { Write-Host "Pencere testi geçti: $tail" }
else { Write-Host "::warning::Uygulama penceresi testi çıkış kodu $code — $tail" }

function PostJson($path, $obj, $session) {
  $b = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 5))
  return Invoke-RestMethod "$base$path" -Method Post -ContentType 'application/json; charset=utf-8' -Body $b -WebSession $session
}

Step 'İlk yönetici hesabı (tek adım, e-postasız)'
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
PostJson '/api/setup' @{ name = 'Test Yönetici'; username = 'test'; password = 'test-sifre-123'; passwordConfirm = 'test-sifre-123' } $s | Out-Null
$me = Invoke-RestMethod "$base/api/auth/me" -WebSession $s
if ($me.user.role -ne 'owner') { Fail 'Kurulumdan sonra yönetici oturumu açılmadı' }

Step 'Kasiyer: otomatik Kasiyer No, No + PIN ile giriş'
$k = PostJson '/api/users' @{ role = 'cashier'; name = 'Test Kasiyer'; pin = '4826' } $s
if ($k.user.cashierNo -ne 1001) { Fail "Kasiyer No beklenen 1001, gelen $($k.user.cashierNo)" }
$ks = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = PostJson '/api/auth/login' @{ mode = 'cashier'; cashierNo = '1001'; pin = '4826' } $ks
if ($login.role -ne 'cashier') { Fail 'Kasiyer girişi başarısız' }
# E-posta bağlı değilken yönetici kasiyerin PIN'ini doğrudan değiştirir
$b2 = [Text.Encoding]::UTF8.GetBytes((@{ secret = '5937'; secretConfirm = '5937' } | ConvertTo-Json))
Invoke-RestMethod "$base/api/users/$($k.user.id)/secret" -Method Put -ContentType 'application/json; charset=utf-8' -Body $b2 -WebSession $s | Out-Null
$ks2 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
if ((PostJson '/api/auth/login' @{ mode = 'cashier'; cashierNo = '1001'; pin = '5937' } $ks2).role -ne 'cashier') { Fail 'Yeni PIN ile kasiyer girişi başarısız' }
$p = Invoke-RestMethod "$base/api/products" -WebSession $s
if ($null -eq $p.items) { Fail 'Ürün listesi alınamadı' }

Step 'Ürün ekleme ve satış (Türkçe karakterler, saat dilimi, fiş no)'
$prod = @{ name = 'Deneme Çay 1 kg'; salePriceKurus = 2500; costPriceKurus = 1500; vatRate = 20; initialStock = 5; categoryName = 'Temel Gıda' } | ConvertTo-Json
$created = Invoke-RestMethod "$base/api/products" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($prod)) -WebSession $s
if ($created.product.name -ne 'Deneme Çay 1 kg') { Fail "Ürün adı bozuk kaydedildi: $($created.product.name)" }
if ($created.product.stockQty -ne 5) { Fail 'Başlangıç stoğu yanlış' }
$sale = @{ clientRequestId = [guid]::NewGuid().ToString(); items = @(@{ productId = $created.product.id; qty = 2 }); paymentMethod = 'cash'; cashReceivedKurus = 10000 } | ConvertTo-Json -Depth 5
$sr = Invoke-RestMethod "$base/api/sales" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($sale)) -WebSession $s
if ($sr.sale.receiptNo -notmatch '^\d{8}-0001$') { Fail "Fiş no beklenmedik: $($sr.sale.receiptNo)" }
if ($sr.sale.totalKurus -ne 5000 -or $sr.sale.changeKurus -ne 5000) { Fail 'Satış tutarı / para üstü yanlış' }
$after = Invoke-RestMethod "$base/api/products" -WebSession $s
if (($after.items | Where-Object { $_.id -eq $created.product.id }).stockQty -ne 3) { Fail 'Satıştan sonra stok düşmedi' }

Step 'Sayfalar, barkod, Excel, yedek'
foreach ($path in @('/panel', '/kasa', '/urunler', '/yonetim', '/raporlar', '/ayarlar', '/etiketler')) {
  $r = Invoke-WebRequest "$base$path" -WebSession $s -UseBasicParsing
  if ($r.StatusCode -ne 200) { Fail "$path → $($r.StatusCode)" }
}
$r = Invoke-WebRequest "$base/api/barcodes/svg?code=2000000000015" -WebSession $s -UseBasicParsing
if ($r.StatusCode -ne 200) { Fail 'Barkod çizimi çalışmıyor' }
$r = Invoke-WebRequest "$base/api/reports/daily/export" -WebSession $s -UseBasicParsing
if ($r.RawContentLength -lt 1000) { Fail 'Excel raporu üretilemedi' }
$b = Invoke-RestMethod "$base/api/backups" -Method Post -WebSession $s
if (-not (Test-Path (Join-Path $root "backups\$($b.file)"))) { Fail 'Yedek dosyası oluşmadı' }

Step 'Güncelleme: yeni sürüm → yedek + indirme (parmak izi) → sessiz kurulum → program yeniden açılır, bilgiler yerinde'
$ver = (Get-Content "$appDir\app\version.json" -Raw | ConvertFrom-Json).version
if ($ver -ne $env:MARKET_KASA_VERSION) { Fail "version.json sürümü $ver, beklenen $env:MARKET_KASA_VERSION" }
$u = (PostJson '/api/update/check' @{} $s).update
if ($u.current -ne $ver) { Fail "Çalışan sürüm $($u.current), beklenen $ver" }
if (-not $u.available -or $u.latest.version -ne '99.0.0') { Fail "Yeni sürüm görünmedi: $($u | ConvertTo-Json -Compress -Depth 4)" }
if (-not $u.canDownload) { Fail 'Güncelleme indirilemez görünüyor (MARKET_UPDATE_DIR?)' }
$backupDir = Join-Path $root 'backups'
$backupsBefore = @(Get-ChildItem $backupDir -Filter *.db).Count
$d = PostJson '/api/update/download' @{} $s
if ($d.version -ne '99.0.0') { Fail "İndirme sonucu beklenmedik: $($d | ConvertTo-Json -Compress)" }
$dl = Join-Path $root 'updates\Optiva-Setup.exe'
if (-not (Test-Path $dl)) { Fail 'İndirilen kurulum dosyası yok' }
if ((Get-FileHash $dl -Algorithm SHA256).Hash.ToLower() -ne $updSha) { Fail 'İndirilen dosyanın parmak izi tutmuyor' }
if (@(Get-ChildItem $backupDir -Filter *.db).Count -le $backupsBefore) { Fail 'Güncellemeden önce yedek alınmadı' }
$pidBefore = (Get-Content (Join-Path $root 'server.pid') | Select-Object -First 1).Trim()
if ((RunExe $exe @('--install-update') 60) -ne 0) { Fail 'Başlatıcı --install-update başarısız' }
$deadline = (Get-Date).AddSeconds(240)
$back = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  $pf = Join-Path $root 'server.pid'
  $pidNow = if (Test-Path $pf) { (Get-Content $pf -ErrorAction SilentlyContinue | Select-Object -First 1) } else { $null }
  if ($pidNow -and $pidNow.Trim() -ne $pidBefore) {
    try { if (-not (Invoke-RestMethod "$base/api/auth/me" -TimeoutSec 5).needsSetup) { $back = $true; break } } catch { }
  }
}
if (-not $back) { Fail 'Güncellemeden sonra program yeniden açılmadı' }
if ((Invoke-RestMethod "$base/api/auth/me" -WebSession $s).user.role -ne 'owner') { Fail 'Güncellemeden sonra oturum kayboldu' }
if (-not ((Invoke-RestMethod "$base/api/products" -WebSession $s).items | Where-Object { $_.name -eq 'Deneme Çay 1 kg' })) { Fail 'Güncellemeden sonra ürün kayboldu' }
if ((Get-Content (Join-Path $root 'logs\launcher.log') -Raw) -notmatch 'Güncelleme kurulumu başlatıldı') { Fail 'Başlatıcı güncellemeyi kaydetmedi' }
Write-Host "Güncelleme çalıştı: $ver → (deneme) 99.0.0, program yeniden açıldı"
# Kurulumun yeniden açtığı pencereyi kapat (sonraki adımlarda dosyalar kilitli kalmasın)
Get-Process -Name 'Optiva' -ErrorAction SilentlyContinue | Stop-Process -Force
Stop-Process -Id $updServer.Id -Force -ErrorAction SilentlyContinue
$env:MARKET_KASA_UPDATE_BASE = $null

Step 'Komut satırı araçları (şifre sıfırlama aracı, yedek)'
Push-Location "$appDir\app"
$env:DB_PATH = Join-Path $root 'data\store.db'
$env:BACKUP_DIR = Join-Path $root 'backups'
$list = & "$appDir\node\node.exe" tools\users-cli.js list
if ($LASTEXITCODE -ne 0 -or ($list -join "`n") -notmatch 'test') { Pop-Location; Fail "users-cli list: $list" }
& "$appDir\node\node.exe" tools\backup.js
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'backup.js çalışmadı' }
Pop-Location

Step 'Durdurma'
RunExe $exe @('--stop') | Out-Null
Start-Sleep -Seconds 2
if ((RunExe $exe @('--status')) -eq 0) { Fail 'Durdurduktan sonra hâlâ çalışıyor' }

Step 'Yeniden başlatma (bilgiler kalıcı mı?)'
if ((RunExe $exe @('--start')) -ne 0) { Fail 'İkinci başlatma başarısız' }
$me = Invoke-RestMethod "$base/api/auth/me"
if ($me.needsSetup) { Fail 'Yeniden başlatınca hesap kaybolmuş' }
RunExe $exe @('--stop') | Out-Null

Step 'Kaldırma (bilgiler kalmalı)'
$code = RunExe "$appDir\unins000.exe" @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART')
# Kaldırıcı kendini geçici klasöre kopyalayıp orada çalışır; bitmesini bekle
for ($i = 0; $i -lt 60 -and (Test-Path $exe); $i++) { Start-Sleep -Seconds 1 }
if (Test-Path $exe) { Fail 'Program kaldırılamadı' }
if (-not (Test-Path (Join-Path $root 'data\store.db'))) { Fail 'Kaldırırken bilgiler silinmiş (silinmemeliydi)' }
if (Test-Path (Join-Path $desktop 'Optiva.lnk')) { Fail 'Masaüstü kısayolu kaldırılmadı' }

Write-Host "`nTÜM KURULUM TESTLERİ GEÇTİ" -ForegroundColor Green
