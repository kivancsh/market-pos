"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

interface Item {
  href: string;
  label: string;
  icon: string;
}

/** Yönetici Paneli menüsü. Yeni yönetici ekranları buraya eklenir. */
export const OWNER_MENU: { title: string; items: Item[] }[] = [
  {
    title: "Genel",
    items: [
      { href: "/yonetim", label: "Genel bakış", icon: "🏠" },
      { href: "/panel", label: "Bugün ve gün sonu", icon: "📅" },
      { href: "/yonetim/asistan", label: "Yapay zekâ asistanı", icon: "✨" },
    ],
  },
  {
    title: "Satış ve kasiyerler",
    items: [
      { href: "/raporlar?rapor=cashiers", label: "Kasiyer performansı", icon: "🧑‍💼" },
      { href: "/iade", label: "İade ve satış iptali", icon: "↩️" },
    ],
  },
  {
    title: "Ürün ve stok",
    items: [
      { href: "/urunler", label: "Ürünler ve fiyatlar", icon: "📦" },
      { href: "/urunler/yeni", label: "Yeni ürün / barkod", icon: "➕" },
      { href: "/yonetim/toplu-fiyat", label: "Toplu fiyat", icon: "🏷️" },
      { href: "/yonetim/kategoriler", label: "Kategoriler", icon: "🗂️" },
      { href: "/mal-girisi", label: "Mal girişi", icon: "🚚" },
      { href: "/stok-sayim", label: "Stok sayımı", icon: "🧮" },
      { href: "/etiketler", label: "Barkod etiketleri", icon: "🖨️" },
    ],
  },
  {
    title: "Muhasebe",
    items: [
      { href: "/yonetim/kar-zarar", label: "Kâr-zarar", icon: "💰" },
      { href: "/yonetim/giderler", label: "Giderler", icon: "🧾" },
    ],
  },
  {
    title: "Raporlar ve analiz",
    items: [
      { href: "/yonetim/analiz", label: "Analizler", icon: "📈" },
      { href: "/raporlar", label: "Raporlar ve Excel", icon: "📊" },
    ],
  },
  {
    title: "Hesaplar ve ayarlar",
    items: [
      { href: "/yonetim/kullanicilar", label: "Kullanıcılar", icon: "👥" },
      { href: "/yonetim/hesabim", label: "Hesabım", icon: "🔑" },
      { href: "/yonetim/islem-gecmisi", label: "İşlem geçmişi", icon: "🕘" },
      { href: "/ayarlar", label: "Ayarlar ve yedekler", icon: "⚙️" },
    ],
  },
];

/**
 * Seçili menü öğesi: adrese en iyi uyan TEK öğe. Sorgulu bağlantı (ör. ?rapor=cashiers) sorgu da tutuyorsa en güçlü;
 * sonra tam adres; sonra alt sayfa (en uzun önek). Böylece /urunler/yeni "Yeni ürün", /urunler/5 "Ürünler" seçili olur.
 */
function useActiveHref(): string | null {
  const pathname = usePathname();
  const params = useSearchParams();
  let best: { href: string; score: number } | null = null;
  for (const href of OWNER_MENU.flatMap((g) => g.items.map((i) => i.href))) {
    const [path, query] = href.split("?") as [string, string | undefined];
    let score = -1;
    if (query) {
      const q = new URLSearchParams(query);
      if (pathname === path && [...q].every(([k, v]) => params.get(k) === v)) score = 2000 + path.length;
    } else if (pathname === path) score = 1000 + path.length;
    else if (pathname.startsWith(`${path}/`)) score = path.length;
    if (score >= 0 && (!best || score > best.score)) best = { href, score };
  }
  return best?.href ?? null;
}

function Menu({ onNavigate }: { onNavigate?: () => void }) {
  const activeHref = useActiveHref();
  return (
    <nav aria-label="Yönetici menüsü" className="flex flex-col gap-4">
      {OWNER_MENU.map((g) => (
        <div key={g.title}>
          <p className="mb-1 px-3 text-xs font-bold uppercase tracking-wide text-slate-500">{g.title}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const active = i.href === activeHref;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                  >
                    <span aria-hidden className="w-5 text-center">
                      {i.icon}
                    </span>
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Geniş ekranda solda sabit menü. */
export function OwnerSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block print:hidden" data-testid="owner-sidebar">
      <div className="sticky top-0 max-h-dvh overflow-y-auto p-3">
        <Menu />
      </div>
    </aside>
  );
}

/** Telefon / dar ekran: üstte "Yönetici menüsü" düğmesi, basınca açılır. */
export function OwnerMobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 bg-white px-3 py-2 lg:hidden print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800"
        data-testid="owner-menu-toggle"
      >
        <span>☰ Yönetici menüsü</span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <Menu onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
