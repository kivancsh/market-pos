"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";

interface Cat {
  id: number;
  name: string;
  productCount: number;
  activeCount: number;
}

function errText(e: unknown, fallback: string) {
  if (!(e instanceof ApiError)) return fallback;
  const d = e.details as { issues?: { message: string }[] } | undefined;
  return d?.issues?.map((i) => i.message).join(" ") || e.message;
}

export function CategoriesScreen() {
  const [items, setItems] = useState<Cat[] | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Cat[] }>("/api/categories")).items);
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Kategoriler yüklenemedi.") });
    }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      setNotice({ kind: "success", text: ok });
      await load();
      return true;
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "İşlem yapılamadı.") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Kategoriler</h1>
      <p className="text-slate-600">Ürünlerin hangi kategoride olduğu ürün sayfasından seçilir. İçinde ürün olan kategori silinemez (geçmiş raporlar bozulmasın).</p>
      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api("/api/categories", { body: { name } }), `"${name.trim()}" eklendi.`)) setName("");
        }}
        className="flex gap-2 rounded-2xl bg-white p-4 shadow-sm"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yeni kategori adı" className="h-11 flex-1 rounded-lg border border-slate-300 px-3" data-testid="cat-name" />
        <button type="submit" disabled={busy || !name.trim()} className="h-11 rounded-xl bg-emerald-600 px-5 font-bold text-white disabled:bg-slate-300" data-testid="cat-add">
          Ekle
        </button>
      </form>
      {items === null ? (
        <p className="py-6 text-center text-slate-500">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">Henüz kategori yok.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm" data-testid="cat-list">
          {items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 p-3">
              {editing?.id === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await run(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: { name: editing.name } }), "Kategori adı değiştirildi."))
                      setEditing(null);
                  }}
                >
                  <input autoFocus value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} className="h-10 flex-1 rounded-lg border border-slate-300 px-3" />
                  <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">
                    Kaydet
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-3 text-sm">
                    Vazgeç
                  </button>
                </form>
              ) : (
                <>
                  <span className="flex-1">
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-2 text-sm text-slate-500">
                      {c.productCount} ürün{c.productCount !== c.activeCount ? ` (${c.activeCount} aktif)` : ""}
                    </span>
                  </span>
                  <Link href={`/urunler?kategori=${c.id}`} className="rounded-lg px-2 py-1 text-sm text-emerald-800 hover:bg-emerald-50">
                    Ürünleri gör
                  </Link>
                  <button type="button" onClick={() => setEditing({ id: c.id, name: c.name })} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
                    Adını değiştir
                  </button>
                  <button
                    type="button"
                    disabled={busy || c.productCount > 0}
                    title={c.productCount > 0 ? "İçinde ürün var" : "Sil"}
                    onClick={() => window.confirm(`"${c.name}" silinsin mi?`) && void run(() => api(`/api/categories/${c.id}`, { method: "DELETE" }), `"${c.name}" silindi.`)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-red-700 disabled:opacity-40"
                  >
                    Sil
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
