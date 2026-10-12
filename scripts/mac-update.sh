#!/bin/bash
# Optiva — Mac güncellemesi (programın içinden: Ayarlar → Güncelle).
# Sunucu arka planda çalıştırır: scripts/mac-update.sh <Optiva-Mac.zip> <sürüm>
#
#  1) Paketi açar ve denetler (henüz hiçbir şey değişmez)
#  2) Sunucuyu durdurur, mevcut sürümü data/updates/previous'a kenara alır
#  3) Yeni dosyaları koyar, paketler değiştiyse kurar, programı derler ve başlatır
#  4) Herhangi bir adım başarısız olursa eski sürümü geri koyup onu başlatır
#
# Bilgilere (data/, backups/, .env) hiç dokunulmaz; güncellemeden önce sunucu zaten yedek alır.
# Sonuç: data/updates/last-result.json (Ayarlar'da görünür) · ayrıntı: data/updates/update.log

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export MARKET_KASA_UPDATER=1 # service.sh: güncelleme bitene kadar bekleme, bu betik yönetiyor

ZIP="${1:-}"
VERSION="${2:-}"
U="data/updates"
LOG="$U/update.log"
STAGE="$U/stage"
PREV="$U/previous"
LOCK="$U/updating.pid"
mkdir -p "$U"

# Kullanıcı bilgileri ve çalışma dosyaları: güncellemede asla değişmez/silinmez
KEEP=(--exclude=/data --exclude=/backups --exclude=/.env --exclude=/.env.local --exclude=/.env.production
  --exclude=/node_modules --exclude=/.git --exclude=/.claude)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG"; }

result() { # ok(1/0) hata-mesajı
  node -e '
    const [ok, version, error, file] = process.argv.slice(1);
    require("fs").writeFileSync(file, JSON.stringify({ ok: ok === "1", version: version || null, error: error || null, at: new Date().toISOString() }));
  ' "$1" "$VERSION" "${2:-}" "$U/last-result.json"
}

# Henüz hiçbir şey değişmeden durmak
fail() {
  log "HATA: $1"
  result 0 "$1"
  rm -rf "$STAGE"
  exit 1
}

# Eski sürümü geri koy ve başlat
rollback() {
  log "GERİ ALINIYOR: $1"
  bash scripts/service.sh stop >>"$LOG" 2>&1
  rsync -a --delete "${KEEP[@]}" "$PREV/" ./ >>"$LOG" 2>&1 || log "Eski dosyalar geri konurken hata"
  if [ -d "$PREV/node_modules" ]; then
    rm -rf node_modules
    mv "$PREV/node_modules" node_modules
  fi
  if bash scripts/service.sh start >>"$LOG" 2>&1; then
    log "Eski sürüm yeniden çalışıyor"
  else
    log "Eski sürüm başlatılamadı (çıkış kodu $?)"
  fi
  result 0 "$1"
  rm -rf "$STAGE" "$ZIP"
  exit 1
}

echo $$ >"$LOCK"
trap 'rm -f "$LOCK"' EXIT
log "=== Güncelleme başlıyor → $VERSION"

# ---------------------------------------------------------------- 1) paketi aç ve denetle
[ -d .git ] && fail "Bu klasör bir geliştirme kopyası (git); güncelleme git ile yapılır."
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Geçersiz sürüm: $VERSION"
[ -f "$ZIP" ] || fail "Güncelleme dosyası bulunamadı."
command -v node >/dev/null 2>&1 || fail "Node.js bulunamadı."
sleep 2 # sunucu "kuruluyor" yanıtını gönderebilsin

rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto -x -k "$ZIP" "$STAGE" >>"$LOG" 2>&1 || fail "Paket açılamadı."
SRC="$STAGE/market-pos"
for f in package.json package-lock.json scripts/service.sh scripts/mac-update.sh mac/bin/MarketKasa version.json; do
  [ -f "$SRC/$f" ] || fail "Paket eksik: $f"
done
for d in data backups node_modules .git; do
  [ -e "$SRC/$d" ] && fail "Pakette olmaması gereken klasör var: $d"
done
grep -q "\"version\": *\"$VERSION\"" "$SRC/version.json" || fail "Paketin sürümü beklenen değil ($VERSION)."

# Paketler (node_modules) değişmediyse yerinde kalır (kopyalamak dakikalar sürer); değiştiyse eskisi kenara alınır
SAME_PACKAGES=0
cmp -s "$SRC/package-lock.json" package-lock.json && [ -d node_modules ] && SAME_PACKAGES=1

# ---------------------------------------------------------------- 2) durdur ve mevcut sürümü kenara al
log "Sunucu durduruluyor"
bash scripts/service.sh stop >>"$LOG" 2>&1
rm -rf "$PREV"
mkdir -p "$PREV"
if ! rsync -a "${KEEP[@]}" --exclude=/.next/cache ./ "$PREV/" >>"$LOG" 2>&1; then
  bash scripts/service.sh start >>"$LOG" 2>&1
  fail "Mevcut sürüm kenara alınamadı (disk dolu olabilir)."
fi
[ "$SAME_PACKAGES" = 0 ] && [ -d node_modules ] && mv node_modules "$PREV/node_modules"

# ---------------------------------------------------------------- 3) yeni sürümü koy, kur, derle, başlat
log "Yeni dosyalar konuyor"
rsync -a --delete "${KEEP[@]}" --exclude=/.next --exclude=/version.json "$SRC/" ./ >>"$LOG" 2>&1 ||
  rollback "Yeni dosyalar kopyalanamadı."
chmod +x scripts/*.sh ./*.command mac/bin/MarketKasa 2>/dev/null

if [ "$SAME_PACKAGES" = 1 ]; then
  log "Paketler aynı; olduğu gibi kullanılıyor"
else
  log "Paketler kuruluyor"
  npm ci --no-audit --no-fund >>"$LOG" 2>&1 || rollback "Paketler kurulamadı (internet bağlantısını kontrol edin)."
fi

[ -f .env ] || cp .env.example .env
rm -rf .next
log "Derleniyor"
npm run build >>"$LOG" 2>&1 || rollback "Yeni sürüm derlenemedi."
cp "$SRC/version.json" version.json

log "Başlatılıyor"
bash scripts/service.sh start >>"$LOG" 2>&1 || rollback "Yeni sürüm başlatılamadı (çıkış kodu $?)."

# Uygulama penceresi (Swift) değiştiyse masaüstündeki simgeyi yenile (çalışan pencere etkilenmez)
APP="$HOME/Desktop/Optiva.app"
if ! cmp -s mac/bin/MarketKasa "$PREV/mac/bin/MarketKasa" && [ -f "$APP/Contents/Resources/project-path.txt" ] &&
  [ "$(cat "$APP/Contents/Resources/project-path.txt")" = "$ROOT" ]; then
  bash scripts/create-app.sh "$ROOT" "$APP" >>"$LOG" 2>&1 || log "Uygulama simgesi yenilenemedi (program yine çalışıyor)"
fi

result 1 ""
log "=== Güncelleme tamam: $VERSION"
rm -rf "$STAGE" "$PREV" "$ZIP"
exit 0
