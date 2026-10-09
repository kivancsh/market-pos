"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "../api";
import type { Role } from "../types";

interface NavItem {
  href: string;
  label: string;
  owner?: boolean;
}

/** Menü. Yeni ekranlar eklendikçe buraya eklenir. */
const ITEMS: NavItem[] = [
  { href: "/panel", label: "Panel", owner: true },
  { href: "/kasa", label: "Kasa" },
  { href: "/iade", label: "İade", owner: true },
  { href: "/urunler", label: "Ürünler", owner: true },
  { href: "/mal-girisi", label: "Mal Girişi", owner: true },
  { href: "/stok-sayim", label: "Stok Sayımı", owner: true },
  { href: "/etiketler", label: "Etiketler", owner: true },
  { href: "/kasa?sim=1", label: "Simülatör", owner: true },
];

export function AppNav({ role, businessName }: { role: Role; businessName: string }) {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const items = ITEMS.filter((i) => !i.owner || role === "owner");

  async function logout() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      // Oturum bitti: istemci durumunu tamamen sıfırlamak için tam sayfa yükleme (bilinçli).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
  }

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-900 px-3 py-2 text-white print:hidden">
      <span className="mr-2 text-lg font-bold">{businessName}</span>
      <nav
        className="order-last -mx-3 flex w-[calc(100%+1.5rem)] gap-1 overflow-x-auto px-3 pb-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        aria-label="Ana menü"
      >
        {items.map((i) => {
          const base = i.href.split("?")[0]!;
          const active = !i.href.includes("?") && (pathname === base || pathname.startsWith(base + "/"));
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`rounded-lg px-3 py-2 text-base font-medium whitespace-nowrap ${active ? "bg-white text-slate-900" : "text-slate-200 hover:bg-slate-700"}`}
            >
              {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <span className="rounded-full bg-slate-700 px-3 py-1 text-sm">{role === "owner" ? "Yönetici" : "Kasiyer"}</span>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
        >
          Çıkış
        </button>
      </div>
    </header>
  );
}
