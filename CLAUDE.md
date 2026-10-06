@AGENTS.md

# market-pos — Proje Kuralları

Tek dükkânlık barkodlu satış / stok / kârlılık sistemi (iç takip; yasal fiş yazar kasadan).
Sahibi yazılımcı değil: kararları sade Türkçe açıkla. Arayüz Türkçe, kod İngilizce.
Bu dosyadaki iş kuralları **değiştirilemez**; teknik sorun çıkarırsa dur ve kullanıcıya sor.

## Komutlar
Node `~/.local/node/bin` altında (Bash'te `export PATH="$HOME/.local/node/bin:$PATH"`).
`npm run lint` · `npm run typecheck` · `npm test` · `npm run test:e2e` · `npm run seed` · `npm run backup` · `npm run check:integrity`
Her aşama sonunda lint + typecheck + test yeşil olmadan ilerleme.

## Mimari
- Next.js 16 App Router, TS strict, Tailwind. **cacheComponents kapalı** (veri hep taze).
- SQLite + better-sqlite3 (WAL, foreign_keys=ON). Tüm SQL `src/server/db/repositories/` içinde.
- İş akışları `src/server/services/`; saf hesap fonksiyonları `src/lib/` (sunucu + tarayıcı ortak).
- Servisler `ctx = { db, now }` alır (test ve seed için saat enjekte edilebilir).
- Yazma işlemleri `db.transaction(...).immediate()` ile.
- Girdiler Zod ile; hata formatı `{ error: { code, message (Türkçe), details? } }`.
- Migration: `src/server/db/migrations/NNN_*.sql`, açılışta sırayla uygulanır.

## Para / KDV / Kâr
- Para **her zaman tam sayı kuruş** (`*_kurus`, INTEGER). Float ile para hesabı YASAK.
  Bölme/yuvarlama yalnızca tam sayı aritmetiğiyle (`divRoundHalfUp`), yarım yukarı.
- Gösterim `Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'})`; giriş `parseTRYToKurus()` (`12,5` / `12.50` / `1.234,56`).
- Satış ve alış fiyatı **KDV dahil**. KDV oranları yalnızca 1, 10, 20 (varsayılan 20).
- Maliyet: ağırlıklı ortalama. `eski=max(stok,0)`; `eski>0 ? round((eski*ort + adet*birim)/(eski+adet)) : birim`.
- Kalem: `gross=price*qty`, `total=gross-disc`, `net=round(total*100/(100+vat))`, `vat=total-net`,
  `cost=unitCost*qty`, `costNet=round(cost*100/(100+vat))`, `profit=net-costNet` (ANA KÂR).
- Satışta fiyat/maliyet/KDV/ad/barkod **snapshot**; eski satış kârı asla değişmez.
- Sepet indirimi (TL veya tam sayı %) kalemlere satır brütü oranında, en büyük kalan yöntemiyle; toplam kuruşu kuruşuna eşit, satır < 0 olamaz.
- Kısmi iade tutarları birikimli hesaplanır: `f(r+k) - f(r)`, `f(n)=round(lineX*n/qty)` → tam iade = satır tutarı.
- Marj = brüt kâr / KDV hariç ciro; ciro 0 ise "—".

## Zaman
- Zaman damgası UTC ISO. `business_date` = Europe/Istanbul `YYYY-MM-DD`, tek kaynak `getBusinessDate()`.
- Fiş no `YYYYMMDD-NNNN`, iş gününe göre 0001'den, transaction içinde. Hafta Pazartesi başlar.

## Barkod
- `product_barcodes.barcode` UNIQUE; ürün başına en fazla 1 birincil.
- Dükkân içi: EAN-13, `200` + 9 hane sıra + kontrol basamağı; sadece rakam (Türkçe klavye sorunu).
- `normalizeBarcode`: kontrol karakteri/boşluk temizle; 13/8 hane rakamsa kontrol basamağı doğrula (hatalıysa eşleştirme yok);
  12 hane → olduğu gibi, yoksa `0`+kod; rakam dışı → büyük/küçük harf duyarlı aynen.
- Kasada eşleşme istemcide `Map<barcode, productId>`; sunucu satışta her şeyi DB'den yeniden doğrular, istemci fiyatına güvenmez.

## Stok
- Değişmez: `products.stock_qty == SUM(stock_movements.qty_change)` her ürün için.
- Yetersiz stokta satış reddedilir (`allow_negative_stock` açıksa uyarıyla izin).
- Ürün silinmez, pasife alınır.

## Roller
- `owner`: her şey. `cashier`: sadece kasa; maliyet/kâr alanları API yanıtlarında **hiç olmaz**; void/iade/mal girişi yok.
- Kasiyer indirimi `cashier_can_discount` ayarına bağlı (varsayılan kapalı).
- Rol kontrolü her zaman sunucuda. PIN'ler `.env`; 5 hatalı denemede 5 dk kilit.

## Kararlaştırılmış varsayımlar
- İadeli satış iptal edilemez; iptal satıştan iade olmaz; iptal sadece aynı iş günü + gün açık.
- Bugün kapalıysa satış ve iade 409; mal girişi/stok sayımı kapalı güne de yazılabilir.
- Nakitte alınan para boşsa tam tutar alındı sayılır.
- Beklenen kasa = açılış kasası + nakit satış − nakit iade.
