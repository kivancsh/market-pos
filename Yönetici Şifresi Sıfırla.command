#!/bin/bash
# Yönetici şifresini unuttuysanız: Finder'da çift tıklayın, yeni şifre belirleyin.
# Program açıkken de çalışır.
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
echo "=============================================="
echo "  Market Kasa — Yönetici şifresi sıfırlama"
echo "=============================================="
echo
npm run --silent users -- reset-password
echo
read -r -p "Kapatmak için Enter'a basın..." _
