#!/bin/bash
# Masaüstüne "Market Kasa" uygulama simgesini oluşturur.
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
on run
	set pathFile to POSIX path of (path to resource "project-path.txt")
	set projectDir to do shell script "cat " & quoted form of pathFile
	set launcher to projectDir & "/scripts/market-kasa.command"
	try
		do shell script "test -x " & quoted form of launcher
	on error
		display dialog "Market Kasa klasörü bulunamadı:" & return & projectDir & return & return & "Klasörü taşıdıysanız, klasördeki 'Kurulum' dosyasına tekrar çift tıklayın." buttons {"Tamam"} default button 1 with icon stop
		return
	end try
	set isRunning to do shell script "/usr/sbin/lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && echo yes || echo no"
	if isRunning is "yes" then
		-- Program zaten açık: sadece tarayıcıyı aç
		open location "http://localhost:3000"
	else
		-- Programı Terminal penceresinde başlat; hazır olunca tarayıcı kendiliğinden açılır
		do shell script "open -a Terminal " & quoted form of launcher
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
