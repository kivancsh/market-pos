#!/bin/bash
# Market Kasa arka plan servisi (Terminal penceresi olmadan).
# Kullanım: scripts/service.sh start | stop | status | ip
# Masaüstündeki "Market Kasa" uygulaması bu betiği çağırır.
#
# start çıkış kodları: 0 çalışıyor · 10 Node.js yok · 11 paket kurulamadı · 12 derleme hatası
#                      13 sunucu açılırken kapandı · 14 zaman aşımı

cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PORT="${MARKET_KASA_PORT:-3000}" # MARKET_KASA_PORT: sadece test için (ayrı deneme kurulumu)
LOGDIR="data/logs"
PIDFILE="data/server.pid"
UPDATE_LOCK="data/updates/updating.pid"
mkdir -p "$LOGDIR"

# Güncelleme (scripts/mac-update.sh) için: sürüm bilgisi ve indirme klasörü sunucuya verilir.
# version.json yalnızca GitHub'dan indirilen kurulumda var; geliştirme kopyasında güncelleme denetlenmez.
export MARKET_UPDATE_DIR="$PWD/data/updates"
if [ -f version.json ]; then
  MARKET_KASA_VERSION_INFO="$(cat version.json)"
  export MARKET_KASA_VERSION_INFO
fi

# Programın içinden güncelleme sürüyorsa bitmesini bekle (en fazla 20 dk); başlatmayı o yapar.
wait_for_update() {
  [ -n "${MARKET_KASA_UPDATER:-}" ] && return 0
  for _ in $(seq 1 600); do
    [ -f "$UPDATE_LOCK" ] && kill -0 "$(cat "$UPDATE_LOCK" 2>/dev/null)" 2>/dev/null || return 0
    sleep 2
  done
}

port_pids() { lsof -nP -t -iTCP:$PORT -sTCP:LISTEN 2>/dev/null; }
is_running() { [ -n "$(port_pids)" ]; }

needs_build() {
  [ ! -f .next/BUILD_ID ] && return 0
  [ -n "$(find src package.json next.config.ts -newer .next/BUILD_ID -type f 2>/dev/null | head -1)" ]
}

start() {
  wait_for_update
  if is_running; then exit 0; fi
  command -v node >/dev/null 2>&1 || exit 10
  if [ ! -d node_modules ]; then
    npm install >>"$LOGDIR/setup.log" 2>&1 || exit 11
  fi
  [ -f .env ] || cp .env.example .env
  if needs_build; then
    npm run build >"$LOGDIR/build.log" 2>&1 || exit 12
  fi
  # Eski kaydı büyüdüyse kenara al
  if [ -f "$LOGDIR/server.log" ] && [ "$(stat -f%z "$LOGDIR/server.log")" -gt 5000000 ]; then
    mv -f "$LOGDIR/server.log" "$LOGDIR/server.old.log"
  fi
  echo "---- $(date '+%Y-%m-%d %H:%M:%S') başlatıldı ----" >>"$LOGDIR/server.log"
  nohup node node_modules/next/dist/bin/next start -H 0.0.0.0 -p $PORT >>"$LOGDIR/server.log" 2>&1 </dev/null &
  local pid=$!
  echo "$pid" >"$PIDFILE"
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "http://localhost:$PORT/login"; then exit 0; fi
    kill -0 "$pid" 2>/dev/null || exit 13
    sleep 1
  done
  exit 14
}

stop() {
  local pids
  pids="$(port_pids)"
  [ -f "$PIDFILE" ] && pids="$pids $(cat "$PIDFILE")"
  for p in $pids; do
    # sadece Node/Next süreçlerini durdur
    if ps -o command= -p "$p" 2>/dev/null | grep -qE "next|node"; then kill "$p" 2>/dev/null; fi
  done
  for _ in $(seq 1 10); do is_running || break; sleep 1; done
  if is_running; then
    for p in $(port_pids); do kill -9 "$p" 2>/dev/null; done
  fi
  rm -f "$PIDFILE"
  echo "---- $(date '+%Y-%m-%d %H:%M:%S') durduruldu ----" >>"$LOGDIR/server.log"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) if is_running; then echo running; else echo stopped; fi ;;
  ip) ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true ;;
  *) echo "Kullanım: $0 start|stop|status|ip" >&2; exit 2 ;;
esac
