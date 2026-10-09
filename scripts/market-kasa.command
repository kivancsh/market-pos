#!/bin/bash
# Market Kasa'yı başlatır (masaüstü simgesi ve "Market Kasa Başlat" bu dosyayı çalıştırır).
# Eksik olanları kendisi tamamlar: paketler, PIN dosyası (.env), derleme. Sonra tarayıcıyı açar.
# Kapatmak için bu pencerede Ctrl + C'ye basın ya da pencereyi kapatın.

cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
PORT=3000

pause_and_exit() {
  echo
  read -r -p "Kapatmak için Enter'a basın..." _
  exit "${1:-1}"
}

echo "=============================================="
echo "  Market Kasa başlatılıyor"
echo "=============================================="
echo

# 1) Node.js var mı?
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js bulunamadı. Önce https://nodejs.org adresinden LTS sürümünü kurun."
  open "https://nodejs.org"
  pause_and_exit 1
fi
echo "✓ Node.js $(node -v)"

# 2) Zaten çalışıyor mu?
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ℹ️  Program zaten çalışıyor. Tarayıcı açılıyor..."
  open "http://localhost:$PORT"
  pause_and_exit 0
fi

# 3) Paketler
if [ ! -d node_modules ]; then
  echo "• Paketler kuruluyor (ilk seferde birkaç dakika sürebilir)..."
  npm install || { echo "❌ Paketler kurulamadı. İnternet bağlantısını kontrol edin."; pause_and_exit 1; }
fi
echo "✓ Paketler hazır"

# 4) Ayar dosyası
[ -f .env ] || cp .env.example .env
echo "✓ Ayar dosyası hazır"

# 5) Derleme: yoksa veya kod derlemeden sonra değiştiyse yeniden derle
needs_build=0
if [ ! -f .next/BUILD_ID ]; then
  needs_build=1
elif [ -n "$(find src package.json next.config.ts -newer .next/BUILD_ID -type f 2>/dev/null | head -1)" ]; then
  needs_build=1
fi
if [ "$needs_build" = 1 ]; then
  echo "• Program derleniyor (1-2 dakika)..."
  npm run build || { echo "❌ Derleme başarısız oldu. Bu pencerenin ekran görüntüsünü destek için saklayın."; pause_and_exit 1; }
fi
echo "✓ Derleme hazır"

# 6) Başlat
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
echo
echo "=============================================="
echo "  Bu bilgisayarda:  http://localhost:$PORT"
if [ -n "$IP" ]; then
  echo "  Telefondan panel: http://$IP:$PORT/panel"
  echo "  (telefon aynı Wi-Fi'de olmalı)"
fi
echo
echo "  ⚠️  Bu pencere açık kaldığı sürece program çalışır."
echo "     Kapatmak için Ctrl + C'ye basın."
echo "=============================================="
echo

# Sunucu hazır olunca tarayıcıyı aç (MP_NO_OPEN=1 ise açma)
if [ "${MP_NO_OPEN:-0}" != 1 ]; then
  (
    for _ in $(seq 1 60); do
      if curl -s -o /dev/null "http://localhost:$PORT/login"; then
        open "http://localhost:$PORT"
        break
      fi
      sleep 1
    done
  ) &
fi

exec npm run start:shop
