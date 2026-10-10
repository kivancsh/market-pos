#!/bin/bash
# Masaüstüne "Market Kasa" uygulamasını oluşturur: program kendi penceresinde açılır,
# sunucu arka planda çalışır (pencereyi kapatmak programı kapatmaz).
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

BIN="$PROJECT/mac/bin/MarketKasa"
if [ ! -x "$BIN" ]; then
  echo "❌ Uygulama dosyası bulunamadı: $BIN" >&2
  exit 1
fi

# Uygulama paketi: kendi penceresinde açılan Market Kasa (mac/MarketKasa.swift)
mkdir -p "$TMP/app/Contents/MacOS" "$TMP/app/Contents/Resources"
cp "$BIN" "$TMP/app/Contents/MacOS/Market Kasa"
chmod +x "$TMP/app/Contents/MacOS/Market Kasa"
cp "$PROJECT/assets/MarketKasa.icns" "$TMP/app/Contents/Resources/MarketKasa.icns"
printf '%s' "$PROJECT" > "$TMP/app/Contents/Resources/project-path.txt"
printf 'APPL????' > "$TMP/app/Contents/PkgInfo"
cat > "$TMP/app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>tr</string>
  <key>CFBundleExecutable</key><string>Market Kasa</string>
  <key>CFBundleIdentifier</key><string>com.marketkasa.app</string>
  <key>CFBundleName</key><string>Market Kasa</string>
  <key>CFBundleDisplayName</key><string>Market Kasa</string>
  <key>CFBundleIconFile</key><string>MarketKasa</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>2.0</string>
  <key>CFBundleVersion</key><string>2</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.business</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHumanReadableCopyright</key><string>Market Kasa — barkodlu satış, stok ve kâr takibi</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key><true/>
  </dict>
</dict>
</plist>
PLIST
mkdir -p "$(dirname "$APP")"
mv "$TMP/app" "$APP"
# Yerel, "ad-hoc" imza (Apple Silicon'da çalışması için gerekli)
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
codesign --verify --deep "$APP"
touch "$APP"
echo "✓ Uygulama oluşturuldu: $APP"
