#!/bin/bash
# Masaüstüne "Market Kasa" uygulama simgesini oluşturur (program arka planda, pencere açmadan çalışır).
# Kullanım: scripts/create-app.sh [proje klasörü] [uygulama yolu]
set -euo pipefail

PROJECT="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
APP="${2:-$HOME/Desktop/Market Kasa.app}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Aynı adda başka bir uygulamanın üzerine yazma; sadece bizim oluşturduğumuzu yenile.
if [ -e "$APP" ]; then
  if [ -f "$APP/Contents/Resources/project-path.txt" ]; then
    rm -rf "$APP"
  else
    echo "❌ '$APP' zaten var ve Market Kasa'ya ait değil. Adını değiştirip tekrar deneyin." >&2
    exit 1
  fi
fi

cat > "$TMP/app.applescript" <<'APPLESCRIPT'
-- Market Kasa: programı arka planda (pencere açmadan) başlatır / durdurur.
on run
	set appIcon to path to resource "applet.icns"
	set pathFile to POSIX path of (path to resource "project-path.txt")
	set projectDir to do shell script "cat " & quoted form of pathFile
	set svc to quoted form of (projectDir & "/scripts/service.sh")
	try
		do shell script "test -f " & svc
	on error
		display dialog "Market Kasa klasörü bulunamadı:" & return & projectDir & return & return & "Klasörü taşıdıysanız, klasördeki 'Kurulum' dosyasına tekrar çift tıklayın." buttons {"Tamam"} default button 1 with title "Market Kasa" with icon stop
		return
	end try

	set svcState to do shell script "/bin/bash " & svc & " status"
	if svcState is "running" then
		set ipAddr to do shell script "/bin/bash " & svc & " ip"
		set msg to "Market Kasa açık ve çalışıyor." & return & return & "Bu bilgisayarda:  http://localhost:3000"
		if ipAddr is not "" then set msg to msg & return & "Telefondan panel:  http://" & ipAddr & ":3000/panel"
		set r to display dialog msg buttons {"Programı kapat", "Tarayıcıda aç"} default button "Tarayıcıda aç" with title "Market Kasa" with icon appIcon
		if button returned of r is "Tarayıcıda aç" then
			open location "http://localhost:3000"
		else
			display dialog "Program kapatılsın mı?" & return & return & "Kapatınca kasa ve panel çalışmaz; tekrar açmak için simgeye çift tıklayın." buttons {"Vazgeç", "Kapat"} default button "Vazgeç" cancel button "Vazgeç" with title "Market Kasa" with icon caution
			do shell script "/bin/bash " & svc & " stop"
			display notification "Program kapatıldı." with title "Market Kasa"
		end if
	else
		display notification "Başlatılıyor… (ilk seferde birkaç dakika sürebilir)" with title "Market Kasa"
		try
			do shell script "/bin/bash " & svc & " start"
		on error errMsg number errNum
			if errNum is 10 then
				display dialog "Node.js bulunamadı." & return & return & "Açılacak sayfadan LTS sürümünü kurun, sonra klasördeki 'Kurulum' dosyasına çift tıklayın." buttons {"Tamam"} default button 1 with title "Market Kasa" with icon stop
				open location "https://nodejs.org"
			else
				set failReason to "bilinmeyen bir hata"
				if errNum is 11 then set failReason to "paketler kurulamadı (internet bağlantısını kontrol edin)"
				if errNum is 12 then set failReason to "program derlenemedi"
				if errNum is 13 then set failReason to "program açılırken kapandı"
				if errNum is 14 then set failReason to "program zamanında yanıt vermedi"
				display dialog "Market Kasa başlatılamadı: " & failReason & "." & return & return & "Ayrıntılar: " & projectDir & "/data/logs" buttons {"Tamam"} default button 1 with title "Market Kasa" with icon stop
			end if
			return
		end try
		open location "http://localhost:3000"
	end if
end run
APPLESCRIPT

osacompile -o "$APP" "$TMP/app.applescript"
printf '%s' "$PROJECT" > "$APP/Contents/Resources/project-path.txt"
cp "$PROJECT/assets/MarketKasa.icns" "$APP/Contents/Resources/applet.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Market Kasa" "$APP/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Market Kasa" "$APP/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Market Kasa" "$APP/Contents/Info.plist"
# Yeni macOS'ta simge Assets.car içindeki katalogdan okunur; kendi simgemiz (applet.icns) kullanılsın.
rm -f "$APP/Contents/Resources/Assets.car"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
# İçeriği değiştirdiğimiz için imzayı yenile (yerel, "ad-hoc" imza)
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
codesign --verify --deep "$APP"
touch "$APP"
echo "✓ Uygulama oluşturuldu: $APP"
