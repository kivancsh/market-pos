"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Yönetim sayfalarında "← Yönetim Paneli" bağlantısı (panel, iade ve hub sayfasında gösterilmez). */
const HIDE = ["/panel", "/iade", "/yonetim", "/simulator"];

export function AdminBreadcrumb() {
  const pathname = usePathname();
  if (HIDE.includes(pathname)) return null;
  return (
    <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-4 print:hidden">
      <Link href="/yonetim" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
        ← Yönetim Paneli
      </Link>
    </div>
  );
}
