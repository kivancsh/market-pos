# Kullanma kılavuzu (kaynak dosyalar)

Hazır kılavuz: [`docs/Market Kasa Kullanma Kılavuzu.pdf`](../Market%20Kasa%20Kullanma%20K%C4%B1lavuzu.pdf) (A4, 50 sayfa, resimli; Mac ve Windows kurulumu dahil).

Bu klasör, PDF'i yeniden üretmek içindir (ör. ekranlar değişince):

| Dosya | Ne yapar |
|---|---|
| `capture.mjs` | Ayrı bir demo veritabanıyla çalışan sunucudan (port 3300) ekran görüntülerini alır ve üzerlerine konacak numaralı işaretlerin konumlarını `notes.json`'a yazar. Gerçek veriye dokunmaz. |
| `kilavuz.html` | Kılavuzun metni ve sayfa düzeni. Görseller ve işaretler sayfa açılırken yerleştirilir. |
| `build-pdf.mjs` | HTML'i A4 PDF'e çevirir (sayfa numaralı). |

## Yeniden üretmek

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm run build
# 1) Demo veritabanı + sunucu (gerçek veriden ayrı)
DB_PATH=data/guide/store.db BACKUP_DIR=data/guide/backups npx tsx scripts/seed.ts
DB_PATH=data/guide/store.db BACKUP_DIR=data/guide/backups SESSION_SECRET=guide-only-secret-0123456789abcdef0123456789 node node_modules/next/dist/bin/next start -p 3300 &
# 2) Ekran görüntüleri (GUIDE_DAY: panelde gösterilecek dolu bir gün, genelde dün)
GUIDE_DAY=2026-10-09 node docs/kilavuz/capture.mjs /tmp/kilavuz-shots
# 3) Görselleri küçült (PNG → JPG, en fazla 2000 px) ve simgeyi ekle
python3 -c "
from PIL import Image; import glob, os, shutil
o='/tmp/kilavuz-jpg'; os.makedirs(o, exist_ok=True)
for f in glob.glob('/tmp/kilavuz-shots/*.png'):
    im=Image.open(f).convert('RGB')
    if im.width>2000: im=im.resize((2000, round(im.height*2000/im.width)))
    im.save(o+'/'+os.path.basename(f)[:-4]+'.jpg', quality=84)
shutil.copy('/tmp/kilavuz-shots/notes.json', o)
Image.open('assets/app-icon-1024.png').resize((400,400)).save(o+'/icon.png')"
# 4) PDF
node docs/kilavuz/build-pdf.mjs /tmp/kilavuz-jpg "docs/Market Kasa Kullanma Kılavuzu.pdf"
# 5) Demo sunucuyu kapat ve demo veriyi sil
kill $(lsof -tiTCP:3300 -sTCP:LISTEN); rm -rf data/guide
```
