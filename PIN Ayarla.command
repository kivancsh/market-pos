#!/bin/bash
# PIN dosyasını (.env) oluşturur ve TextEdit'te açar. Finder'da çift tıklayın.
cd "$(dirname "$0")" || exit 1
[ -f .env ] || cp .env.example .env
echo "PIN dosyası TextEdit'te açılıyor."
echo
echo "  • OWNER_PIN  = yönetici PIN'i"
echo "  • CASHIER_PIN = kasiyer PIN'i"
echo "  • 4-8 rakam, ikisi farklı olmalı; '=' işaretinin yanında boşluk olmasın."
echo "  • Kaydedin (⌘ + S), sonra programı yeniden başlatın"
echo "    (Market Kasa penceresinde Ctrl + C, ardından 'Market Kasa Başlat'a çift tıklayın)."
echo
open -e .env
read -r -p "Kapatmak için Enter'a basın..." _
