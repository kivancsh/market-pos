#!/bin/bash
# Demo veritabanını sıfırlar (gerçek veriye dokunmaz): örnek veriler + yönetici + 2 kasiyer.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.local/node/bin:$PATH"
export DB_PATH=data/demo/store.db BACKUP_DIR=data/demo/backups
rm -rf data/demo
npx tsx scripts/seed.ts >/dev/null
npx tsx scripts/users-cli.ts create-owner ayse demo-sifre-2026 --email=ayse.ornek@gmail.com Ayşe Yılmaz >/dev/null
npx tsx scripts/users-cli.ts create-cashier "Mehmet Kaya" 2468 >/dev/null   # Kasiyer No 1001
npx tsx scripts/users-cli.ts create-cashier "Zeynep Arslan" 1357 >/dev/null # Kasiyer No 1002
echo "demo veritabanı hazır: $DB_PATH"
