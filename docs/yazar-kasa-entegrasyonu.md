# Yazar kasa (ÖKC) entegrasyonu — durum ve yapılacaklar

Optiva, yeni nesil yazar kasayla (ÖKC) birlikte çalışacak şekilde hazırlandı. Bu belge, programın şu an neyi
yaptığını ve gerçek bir Hugin ya da Pavo cihazıyla canlı kullanım için **sizin** (yazılım sahibi olarak) yapmanız
gerekenleri anlatır.

## Program şu an ne yapıyor?

**Ayarlar → Yazar kasa (ÖKC) bağlantısı** bölümünde beş seçenek var:

| Seçenek | Ne olur |
|---|---|
| Yazar kasa bağlantısı yok | Program yalnız iç takip yapar (ÖKC'den muaf dükkân). |
| Yazar kasayı ayrı kullanıyorum | Her satıştan sonra "yazar kasadan fişi kesmeyi unutmayın" hatırlatması. Gün sonunda yazar kasanın Z toplamı yazılır, programın cirosuyla karşılaştırılır; fark %5'i geçerse uyarı. |
| **Hugin (Cloud Link)** | Satış yazar kasaya gider; ödeme ve yasal fiş yazar kasada; fiş/Z numarası programa geri gelir. |
| Pavo (yerel ağ) | Pavo'nun entegrasyon belgesi gelince açılacak (şimdilik seçilemez). |
| Deneme (simülatör) | Cihaz olmadan denemek ve kasiyer eğitmek için. |

Bağlı çalışırken kasada akış:
1. Kasiyer ürünleri okutur, NAKİT/KART'a basar.
2. Ekranda "Yazar kasada ödemeyi tamamlayın" çıkar; satış yazar kasanın "Siparişler" listesine düşer.
3. Yazar kasada ödeme alınır, yasal fiş basılır → program "Satış tamamlandı · yazar kasa fiş no …" gösterir.
4. Yazar kasa hata verirse (kâğıt bitti, fiş limiti vb.) hata mesajı görünür: **Tekrar gönder** ya da **Satışı iptal et**.
   İptalde satış ciroya girmez, stok geri eklenir, ürünler tek tuşla sepete geri alınabilir.
5. Gün sonunda fişi kesilmemiş satış kaldıysa "Günü Kapat" ekranı uyarır.

Bu akışın tamamı otomatik testlerle sınanıyor (Hugin cihazının gönderdiği istekler, resmî örnek biçimde taklit edilerek).

## Hugin ile canlı kullanım için yapılacaklar (sizin tarafınızda)

1. **Entegrasyon anlaşması.** Hugin'in teknik dokümanına göre ÖKC ile entegre olacak her yazılım firması Hugin ile
   bağlayıcı bir anlaşma imzalar; Hugin yazılımı GİB'e bildirir ve yazılım için lisans kodu alır.
   Hugin'e başvurup "Cloud Link (REST) entegrasyonu" yapmak istediğinizi söyleyin. Bir **test cihazı** isteyin.
2. **Cihaz modelini doğrulayın.** Cloud Link'in hangi Hugin modellerinde (ör. Android'li yeni modeller) çalıştığını sorun.
3. **Hugin'e iki bilgi verilecek:** adres ve şifre. Şifre programda: Ayarlar → Yazar kasa → Hugin → "Göster".
   Adres konusunda önemli bir nokta: Hugin'in örnek dokümanına göre yazar kasa, Hugin'in kendi sunucusu (TSM) üzerinden
   **internetten HTTPS ile** bizim programa bağlanıyor. Dükkân bilgisayarındaki program internetten doğrudan erişilebilir
   olmadığı için bir **köprü adresi** gerekir (ör. her dükkân için güvenli bir tünel ya da Optiva'nın merkezi
   sunucusu üzerinden aktarma). Bunu Hugin'in teknik ekibiyle netleştirin; köprü kısmını birlikte kurarız.
4. **Test sırasında doğrulanacak 2 ayrıntı** (Hugin'in tam alan listesi entegratöre verildiği için):
   - Perakende fiş için belge türü değeri (programda `RECEIPT`; tek satırla değiştirilir: `src/server/okc/hugin.ts`).
   - Cihazın satış bildiriminde fiş ve Z numarasının alan adları (program yaygın adları tanıyor; gelen ham kayıt saklanıyor).

## Pavo ile canlı kullanım için yapılacaklar

Pavo yerel ağda REST ile bağlanıyor (cihazda "Harici Entegrasyon – REST" modu, IP adresi + seri numarası), ancak uç
noktalar ve veri biçimi herkese açık değil. Pavo'dan (entegrasyon / kurumsal satış birimi) **entegrasyon dokümanı ve
test cihazı** isteyin. Belge geldiğinde Pavo sürücüsü programdaki hazır altyapıya eklenir; kasa ekranı, iptal, gün sonu
gibi kısımlar zaten hazır.

## Mali müşavir

Hangi dükkânın ÖKC kullanmak zorunda olduğu ve "yazar kasayı ayrı kullanıyorum" seçeneğinin hangi durumlarda yeterli
olduğu konusunda satışa başlamadan önce mali müşavir görüşü alın.

## Kaynaklar

- Hugin Cloud Link demo sunucusu (MIT): https://github.com/huginsdk/cls-demo
- Hugin FPU teknik dokümanı (JSON satış belgesi alanları, hukuki kurallar): https://github.com/huginsdk/fpu/wiki
- GİB YN ÖKC – Harici Donanım ve Yazılım Haberleşme Protokolü (GMP-3): https://ynokc.gib.gov.tr/UploadedFiles/Files/GMP3_v5_0_02082018.pdf
