#!/bin/bash
# Veritabanının anlık yedeğini 'backups' klasörüne alır. Finder'da çift tıklayın.
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
npm run backup && open backups
echo
read -r -p "Kapatmak için Enter'a basın..." _
