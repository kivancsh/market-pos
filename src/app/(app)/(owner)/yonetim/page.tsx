import Link from "next/link";
import { getDb } from "@/server/db/connection";
import { listUsers } from "@/server/db/repositories/users";
import { getStockAlerts } from "@/server/db/repositories/reports";
import { listProducts } from "@/server/db/repositories/products";
import { requirePageUser } from "@/server/auth/pageSession";

export const metadata = { title: "Yönetim Paneli · Market Kasa" };

interface Tile {
  href: string;
  title: string;
  desc: string;
  icon: string;
  badge?: string;
}

export default async function AdminHub(props: PageProps<"/yonetim">) {
  const me = await requirePageUser("owner");
  const sp = await props.searchParams;
  const db = getDb();
  const products = listProducts(db, { activeOnly: true });
  const alerts = getStockAlerts(db);
  const users = listUsers(db);
  const cashiers = users.filter((u) => u.role === "cashier" && u.isActive).length;

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "Ürünler ve fiyatlar",
      tiles: [
        { href: "/urunler", title: "Ürünler ve fiyatlar", desc: "Ürün ekle, düzenle, fiyatı listede hızlıca değiştir, barkodlar, pasife al.", icon: "📦", badge: `${products.length} ürün` },
        { href: "/urunler/yeni", title: "Yeni ürün ekle", desc: "Ad, fiyat, KDV, barkod (okut veya üret), başlangıç stoğu.", icon: "➕" },
        { href: "/yonetim/toplu-fiyat", title: "Toplu fiyat güncelleme", desc: "Kategoriye veya seçili ürünlere % ya da ₺ zam/indirim, önizlemeli.", icon: "🏷️" },
        { href: "/yonetim/kategoriler", title: "Kategoriler", desc: "Kategori ekle, adını değiştir, boş kategoriyi sil.", icon: "🗂️" },
        { href: "/etiketler", title: "Barkod etiketleri", desc: "A4 etiket kâğıdına barkod ve fiyat etiketi bas.", icon: "🖨️" },
        { href: "/ayarlar#ice-aktar", title: "Excel'den ürün aktar", desc: "Şablonu doldurup toplu ürün ekle.", icon: "📥" },
      ],
    },
    {
      title: "Stok",
      tiles: [
        { href: "/mal-girisi", title: "Mal girişi", desc: "Gelen malı okut, adet ve alış fiyatı gir; maliyet güncellenir.", icon: "🚚" },
        {
          href: "/stok-sayim",
          title: "Stok sayımı / düzeltme",
          desc: "Rafta sayılan adedi gir; fark gerekçesiyle kaydedilir.",
          icon: "🧮",
          badge: alerts.critical.length + alerts.outOfStock.length > 0 ? `${alerts.critical.length + alerts.outOfStock.length} kritik` : undefined,
        },
      ],
    },
    {
      title: "Raporlar ve kayıtlar",
      tiles: [
        { href: "/raporlar", title: "Raporlar", desc: "Günlük özet, ürün/kategori kârlılığı, stok değeri; Excel'e aktar.", icon: "📊" },
        { href: "/yonetim/islem-gecmisi", title: "İşlem geçmişi", desc: "Kim ne zaman fiyat değiştirdi, iptal/iade yaptı, ayar değiştirdi.", icon: "🕘" },
      ],
    },
    {
      title: "Hesaplar ve ayarlar",
      tiles: [
        { href: "/yonetim/kullanicilar", title: "Kullanıcılar", desc: "Kasiyer ekle/çıkar, PIN değiştir; başka yönetici ekle.", icon: "👥", badge: `${cashiers} kasiyer` },
        { href: "/yonetim/hesabim", title: "Hesabım", desc: "Adınız, kullanıcı adınız ve şifreniz.", icon: "🔑" },
        { href: "/ayarlar", title: "Ayarlar ve yedekler", desc: "İşletme adı, açılış kasası, okuyucu, ses, etiket düzeni, yedekler.", icon: "⚙️" },
        { href: "/kasa?sim=1", title: "Okuyucu simülatörü", desc: "Barkod okuyucu olmadan kasayı denemek için.", icon: "🧪" },
      ],
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-3 sm:p-4">
      <div>
        <h1 className="text-2xl font-bold">Yönetim Paneli</h1>
        <p className="text-slate-600">Hoş geldiniz, {me.name}. Bütün yönetim işleri buradan yapılır.</p>
      </div>
      {sp.hosgeldin === "1" && (
        <div role="status" className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <strong>Yönetici hesabınız oluşturuldu.</strong> Sırada: <Link href="/yonetim/kullanicilar" className="underline">kasiyer ekleyin</Link>,{" "}
          <Link href="/ayarlar" className="underline">işletme adını girin</Link> ve <Link href="/urunler/yeni" className="underline">ürünlerinizi ekleyin</Link>.
        </div>
      )}
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{g.title}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-400 hover:shadow"
                data-testid={`tile-${t.href}`}
              >
                <span className="text-3xl" aria-hidden>
                  {t.icon}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-slate-900">{t.title}</span>
                    {t.badge && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{t.badge}</span>}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">{t.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
