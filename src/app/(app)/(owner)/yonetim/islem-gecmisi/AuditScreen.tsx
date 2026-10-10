"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, formatIstanbulDateTime, getBusinessDate } from "@/lib/businessDate";
import { api, ApiError } from "@/client/api";
import { Notice } from "@/client/components/Notice";

interface Entry {
  id: number;
  createdAt: string;
  userName: string | null;
  role: string | null;
  action: string;
  summary: string;
}

interface AuditResponse {
  items: Entry[];
  total: number;
  page: number;
  pageSize: number;
  actions: Record<string, string>;
  users: { id: number; name: string; role: string }[];
}

/** Filtrede eylem grupları: önek eşleşmesiyle (ör. "product." tüm ürün işlemleri). */
const GROUPS: { key: string; label: string }[] = [
  { key: "auth.", label: "Giriş / çıkış" },
  { key: "product.", label: "Ürün ve fiyat" },
  { key: "category", label: "Kategori" },
  { key: "sale.", label: "Satış iptali" },
  { key: "return.", label: "İade" },
  { key: "purchase.", label: "Mal girişi" },
  { key: "stock.", label: "Stok sayımı" },
  { key: "day.", label: "Gün kapanışı" },
  { key: "user.", label: "Kullanıcılar" },
  { key: "settings.", label: "Ayarlar" },
  { key: "backup.", label: "Yedek" },
  { key: "expense.", label: "Giderler" },
  { key: "update.", label: "Program güncellemesi" },
];

export function AuditScreen() {
  const today = getBusinessDate();
  const [range, setRange] = useState({ from: addDays(today, -6), to: today });
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ from: range.from, to: range.to, page: String(page) });
    if (action) qs.set("action", action);
    if (userId) qs.set("userId", userId);
    try {
      setData(await api<AuditResponse>(`/api/audit?${qs}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem geçmişi yüklenemedi.");
    }
  }, [range, action, userId, page]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const field = "h-10 rounded-lg border border-slate-300 px-2 text-base";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">İşlem geçmişi</h1>
      <p className="text-slate-600">Kim, ne zaman, ne yaptı: fiyat değişiklikleri, iptaller, iadeler, mal girişleri, ayarlar ve girişler.</p>
      {error && <Notice kind="error">{error}</Notice>}

      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 shadow-sm">
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Başlangıç
          <input
            type="date"
            value={range.from}
            max={today}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setPage(1);
              setRange((r) => ({ from: v, to: r.to < v ? v : r.to }));
            }}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Bitiş
          <input
            type="date"
            value={range.to}
            max={today}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setPage(1);
              setRange((r) => ({ from: r.from > v ? v : r.from, to: v }));
            }}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-600">
          İşlem türü
          <select value={action} onChange={(e) => (setAction(e.target.value), setPage(1))} className={field} data-testid="audit-action">
            <option value="">Hepsi</option>
            {GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Kişi
          <select value={userId} onChange={(e) => (setUserId(e.target.value), setPage(1))} className={field}>
            <option value="">Herkes</option>
            {data?.users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.name} ({u.role === "owner" ? "yönetici" : "kasiyer"})
              </option>
            ))}
          </select>
        </label>
      </div>

      {data && (
        <>
          <p className="text-sm text-slate-600">{data.total} kayıt</p>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm" data-testid="audit-table">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">Zaman</th>
                  <th className="px-3 py-2">Kişi</th>
                  <th className="px-3 py-2">İşlem</th>
                  <th className="px-3 py-2">Ayrıntı</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Bu aralıkta kayıt yok.
                    </td>
                  </tr>
                )}
                {data.items.map((e) => (
                  <tr key={e.id} className={`border-t border-slate-100 align-top ${e.action === "auth.login_failed" ? "bg-red-50" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatIstanbulDateTime(e.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{e.userName ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{data.actions[e.action] ?? e.action}</td>
                    <td className="px-3 py-2">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-10 rounded-lg bg-slate-100 px-4 font-semibold disabled:opacity-40">
                ← Önceki
              </button>
              <span className="text-sm">
                Sayfa {page} / {pages}
              </span>
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="h-10 rounded-lg bg-slate-100 px-4 font-semibold disabled:opacity-40">
                Sonraki →
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
