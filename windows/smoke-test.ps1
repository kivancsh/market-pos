# Market Kasa — Windows kurulum testi (GitHub Actions'ta, gerçek Windows'ta çalışır).
# Kur → başlat → hesap aç → sayfaları/raporu/yedeği dene → durdur → yeniden başlat (veri kalıcı mı?) → kaldır (veri kalıyor mu?)
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3000'
$root = Join-Path $env:LOCALAPPDATA 'Market Kasa'
$appDir = Join-Path $env:LOCALAPPDATA 'Programs\Market Kasa'
$exe = Join-Path $appDir 'Market Kasa.exe'

function Step($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Fail($m) {
  Write-Host "HATA: $m" -ForegroundColor Red
  foreach ($f in @('server.log', 'launcher.log')) {
    $p = Join-Path $root "logs\$f"
    if (Test-Path $p) { Write-Host "--- $f"; Get-Content $p -Tail 80 }
  }
  exit 1
}
function RunExe($file, $argList) {
  $p = Start-Process -FilePath $file -ArgumentList $argList -Wait -PassThru
  return $p.ExitCode
}

Step 'Kurulum (sessiz)'
$setup = Resolve-Path 'build\dist\Market-Kasa-Setup.exe'
$code = RunExe $setup @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/TASKS=desktopicon')
if ($code -ne 0) { Fail "Kurulum çıkış kodu $code" }
foreach ($f in @($exe, "$appDir\node\node.exe", "$appDir\app\server.js", "$appDir\app\kasa-server.js", "$appDir\app\tools\users-cli.js", "$appDir\unins000.exe")) {
  if (-not (Test-Path $f)) { Fail "Kurulumdan sonra eksik: $f" }
}
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path (Join-Path $desktop 'Market Kasa.lnk'))) { Fail 'Masaüstü kısayolu yok' }
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Market Kasa'
foreach ($l in @('Market Kasa.lnk', 'Yönetici Şifresi Sıfırla.lnk', 'Yedek Al.lnk')) {
  if (-not (Test-Path (Join-Path $startMenu $l))) { Fail "Başlat menüsünde eksik kısayol: $l" }
}
Get-ChildItem -Recurse $appDir -Include *.db, *.sqlite, session-secret, .env* | ForEach-Object { Fail "Pakette kişisel dosya var: $($_.FullName)" }

Step 'Başlatma'
$code = RunExe $exe @('--start')
if ($code -ne 0) { Fail "Başlatıcı --start çıkış kodu $code" }
if ((RunExe $exe @('--status')) -ne 0) { Fail '--status çalışmıyor diyor' }
$me = Invoke-RestMethod "$base/api/auth/me"
if (-not $me.needsSetup) { Fail 'İlk açılışta kurulum ekranı bekleniyordu' }
$r = Invoke-WebRequest "$base/" -MaximumRedirection 5 -UseBasicParsing
if ($r.Content -notmatch 'Yönetici hesabı') { Fail 'Kurulum sayfası gelmedi' }

Step 'İlk yönetici hesabı ve oturum'
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ name = 'Test Yönetici'; username = 'test'; password = 'test-sifre-123'; passwordConfirm = 'test-sifre-123' } | ConvertTo-Json
Invoke-RestMethod "$base/api/setup" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -WebSession $s | Out-Null
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
Start-Sleep -Seconds 5
if (Test-Path $exe) { Fail 'Program kaldırılamadı' }
if (-not (Test-Path (Join-Path $root 'data\store.db'))) { Fail 'Kaldırırken bilgiler silinmiş (silinmemeliydi)' }
if (Test-Path (Join-Path $desktop 'Market Kasa.lnk')) { Fail 'Masaüstü kısayolu kaldırılmadı' }

Write-Host "`nTÜM KURULUM TESTLERİ GEÇTİ" -ForegroundColor Green
