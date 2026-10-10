"""Mac paketini (Market-Kasa-Mac.zip) denetler: gerekli dosyalar var, kişisel dosya yok,
betikler çalıştırılabilir ve satır sonları Unix biçiminde (CRLF olursa Mac'te çalışmaz)."""
import sys
import zipfile

z = zipfile.ZipFile(sys.argv[1])
names = set(z.namelist())
P = "market-pos/"
errors = []
for f in ["version.json", "package.json", "package-lock.json", "Kurulum.command", "scripts/service.sh", "scripts/mac-update.sh",
          "scripts/create-app.sh", "mac/bin/MarketKasa", "src/server/db/migrations/001_init.sql"]:
    if P + f not in names:
        errors.append(f"eksik: {f}")
for n in names:
    rel = n[len(P):]
    if rel.split("/")[0] in ("data", "backups", "node_modules", ".next", "promo") or rel.startswith(".env") and rel != ".env.example":
        errors.append(f"olmaması gereken: {rel}")
for n in names:
    rel = n[len(P):]
    if rel.endswith((".sh", ".command")) or rel == "mac/bin/MarketKasa":
        mode = (z.getinfo(n).external_attr >> 16) & 0o777
        if not mode & 0o100:
            errors.append(f"çalıştırılabilir değil: {rel} ({oct(mode)})")
        if rel != "mac/bin/MarketKasa" and b"\r\n" in z.read(n):
            errors.append(f"CRLF satır sonu: {rel}")
if errors:
    for e in errors:
        print(f"::error::Mac paketi: {e}")
    sys.exit(1)
print(f"Mac paketi tamam: {len(names)} dosya")
