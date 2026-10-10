#!/bin/bash
# Market Kasa KURULUM. Finder'da çift tıklayın.
# Eksikleri tamamlar ve masaüstüne "Market Kasa" uygulama simgesini koyar.

cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

finish() {
  echo
  read -r -p "Kapatmak için Enter'a basın..." _
  exit "${1:-0}"
}

echo "=============================================="
echo "  Market Kasa — Kurulum"
echo "=============================================="
echo

# 1) Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js bulunamadı."
  echo "   Açılan sayfadan LTS sürümünü indirip kurun, sonra bu dosyaya tekrar çift tıklayın."
  open "https://nodejs.org"
  finish 1
fi
echo "✓ Node.js $(node -v)"

# 2) Paketler
if [ ! -d node_modules ]; then
  echo "• Paketler kuruluyor (birkaç dakika sürebilir)..."
  npm install || { echo "❌ Paketler kurulamadı. İnternet bağlantısını kontrol edip tekrar deneyin."; finish 1; }
fi
echo "✓ Paketler hazır"

# 3) Ayar dosyası
[ -f .env ] || cp .env.example .env
echo "✓ Ayar dosyası hazır"

# 4) Derleme (çalışan program varsa önce durdurulması gerekir)
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "• Program şu an açık; derleme atlandı (gerekirse programı kapatıp kurulumu tekrar çalıştırın)."
else
  echo "• Program derleniyor (1-2 dakika)..."
  npm run build >/tmp/market-kasa-build.log 2>&1 || {
    echo "❌ Derleme başarısız. Ayrıntı: /tmp/market-kasa-build.log"
    finish 1
  }
  echo "✓ Derleme hazır"
fi

# 5) Masaüstü simgesi
chmod +x scripts/market-kasa.command scripts/create-app.sh scripts/service.sh *.command 2>/dev/null
if bash scripts/create-app.sh "$(pwd)" "$HOME/Desktop/Market Kasa.app"; then
  echo "✓ Masaüstüne 'Market Kasa' simgesi kondu."
else
  finish 1
fi

echo
echo "=============================================="
echo "  KURULUM TAMAM"
echo
echo "  • Programı açmak için masaüstündeki 'Market Kasa' simgesine çift tıklayın."
echo "    Program kendi penceresinde açılır; sunucu arka planda çalışır."
echo "  • Pencereyi kapatmak programı kapatmaz (telefondan takip sürer)."
echo "    Tamamen kapatmak için üst menü: Market Kasa → Programı tamamen kapat."
echo "  • Dock'a eklemek için simgeyi Dock'a sürükleyin."
echo "  • İlk açılışta YÖNETİCİ HESABI oluşturma ekranı gelir (ad, kullanıcı adı, şifre)."
echo "    Kasiyerleri sonra Yönetim Paneli → Kullanıcılar'dan eklersiniz."
echo "  • Yönetici şifresini unutursanız: 'Yönetici Şifresi Sıfırla' dosyasına çift tıklayın."
echo "=============================================="
finish 0
