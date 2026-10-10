#!/bin/bash
# Mac uygulamasının ikili dosyasını derler (Apple Silicon: macOS 12+, Intel: macOS 13+).
# Çıktı: mac/bin/MarketKasa (depoya eklenir; Kurulum bunu kullanır, derleyici gerekmez).
set -euo pipefail
cd "$(dirname "$0")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for target in arm64-apple-macos12.0 x86_64-apple-macos13.0; do
  arch="${target%%-*}"
  swiftc -O -swift-version 5 -target "$target" -framework Cocoa -framework WebKit \
    -o "$TMP/MarketKasa-$arch" MarketKasa.swift
done
mkdir -p bin
lipo -create -output bin/MarketKasa "$TMP/MarketKasa-arm64" "$TMP/MarketKasa-x86_64"
lipo -info bin/MarketKasa
