"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { endOfMonth, formatBusinessDate, getBusinessDate, startOfMonth } from "@/lib/businessDate";
import { EXPENSE_CATEGORIES, EXPENSE_VAT_RATES, expenseCategoryLabel, type ExpenseCategory } from "@/lib/expenses";
import { formatKurusPlain, formatTRY, parseTRYToKurus } from "@/lib/money";
import { api } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { errText } from "@/client/errors";

interface Expense {
  id: number;
  businessDate: string;
  category: string;
  description: string | null;
  amountKurus: number;
  vatRate: number;
  netKurus: number;
  vatKurus: number;
  userName: string | null;
}
interface Totals {
  amountKurus: number;
  netKurus: number;
  vatKurus: number;
  byCategory: { category: string; amountKurus: number; count: number }[];
}

const field = "mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-base";
const emptyForm = (date: string) => ({ businessDate: date, category: "kira" as ExpenseCategory, description: "", amount: "", vatRate: 0 as number });

/** Giderler: kira, personel, faturalar… Kâr-zararda net kârı hesaplamak için. */
export function ExpensesScreen() {
  const today = getBusinessDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<{ items: Expense[]; totals: Totals } | null>(null);
  const [form, setForm] = useState(emptyForm(today));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const from = startOfMonth(`${month}-01`);
  const to = endOfMonth(from);
  const url = `/api/expenses?from=${from}&to=${to}`;
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);
  useEffect(() => {
    let cancelled = false;
    api<{ items: Expense[]; totals: Totals }>(url)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setNotice({ kind: "error", text: errText(e, "Giderler yüklenemedi.") });
      });
    return () => {
      cancelled = true;
    };
  }, [url, reloadKey]);

  async function save() {
    const amountKurus = parseTRYToKurus(form.amount);
    if (amountKurus === null || amountKurus <= 0) {
      setNotice({ kind: "error", text: "Tutarı yazın (ör. 12.500 ya da 850,75)." });
      return;
    }
    setBusy(true);
    const body = { businessDate: form.businessDate, category: form.category, description: form.description, amountKurus, vatRate: form.vatRate };
    try {
      if (editingId) await api(`/api/expenses/${editingId}`, { method: "PATCH", body });
      else await api("/api/expenses", { body });
      setNotice({ kind: "success", text: editingId ? "Gider düzeltildi." : `Gider eklendi: ${expenseCategoryLabel(form.category)} ${formatTRY(amountKurus)}.` });
      setEditingId(null);
      setForm(emptyForm(form.businessDate));
      if (form.businessDate.slice(0, 7) !== month) setMonth(form.businessDate.slice(0, 7));
      else load();
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Kaydedilemedi.") });
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: Expense) {
    if (!window.confirm(`${expenseCategoryLabel(e.category)} ${formatTRY(e.amountKurus)} (${formatBusinessDate(e.businessDate)}) silinsin mi?`)) return;
    setBusy(true);
    try {
      await api(`/api/expenses/${e.id}`, { method: "DELETE" });
      setNotice({ kind: "success", text: "Gider silindi." });
      load();
    } catch (err) {
      setNotice({ kind: "error", text: errText(err, "Silinemedi.") });
    } finally {
      setBusy(false);
    }
  }

  function edit(e: Expense) {
    setEditingId(e.id);
    setForm({ businessDate: e.businessDate, category: e.category as ExpenseCategory, description: e.description ?? "", amount: formatKurusPlain(e.amountKurus), vatRate: e.vatRate });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <div>
        <h1 className="text-2xl font-bold">Giderler</h1>
        <p className="text-slate-600">
          Kira, personel, faturalar gibi giderleri yazın; <Link href="/yonetim/kar-zarar" className="font-semibold text-emerald-800 underline">Kâr-zarar</Link> ekranında
          net kârınız hesaplanır. Tutarı ödediğiniz gibi (KDV dahil) yazın.
        </p>
      </div>
      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
        data-testid="expense-form"
      >
        <h2 className="text-lg font-semibold sm:col-span-2 lg:col-span-6">{editingId ? "Gideri düzelt" : "Gider ekle"}</h2>
        <label className="text-sm font-medium text-slate-700 lg:col-span-1">
          Tarih
          <input type="date" value={form.businessDate} max={today} onChange={(e) => setForm({ ...form, businessDate: e.target.value })} className={field} data-testid="expense-date" />
        </label>
        <label className="text-sm font-medium text-slate-700 lg:col-span-2">
          Kategori
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory, vatRate: e.target.value === "kira" || e.target.value === "personel" || e.target.value === "vergi" ? 0 : form.vatRate || 20 })} className={field} data-testid="expense-category">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 lg:col-span-3">
          Açıklama (isteğe bağlı)
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} placeholder="ör. Ekim kirası, elektrik faturası" data-testid="expense-description" />
        </label>
        <label className="text-sm font-medium text-slate-700 lg:col-span-2">
          Tutar (KDV dahil, ₺)
          <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={field} placeholder="ör. 12.500" data-testid="expense-amount" />
        </label>
        <label className="text-sm font-medium text-slate-700 lg:col-span-2">
          KDV oranı
          <select value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })} className={field} data-testid="expense-vat">
            {EXPENSE_VAT_RATES.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "KDV yok (%0)" : `%${v}`}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2 lg:col-span-2">
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm(today)); }} className="h-11 flex-1 rounded-xl border border-slate-300 font-semibold">
              Vazgeç
            </button>
          )}
          <button type="submit" disabled={busy} className="h-11 flex-1 rounded-xl bg-emerald-600 font-bold text-white disabled:bg-slate-300" data-testid="expense-save">
            {editingId ? "Kaydet" : "Ekle"}
          </button>
        </div>
      </form>

      <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Giderler listesi">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-lg font-semibold">
            {new Date(`${month}-15T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })} giderleri
          </h2>
          <input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-2" data-testid="expense-month" />
          <a href={`/api/reports/expenses/export?from=${from}&to=${to}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
            Excel&apos;e aktar
          </a>
        </div>
        {data && data.totals.byCategory.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2" data-testid="expense-totals">
            <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">Toplam {formatTRY(data.totals.amountKurus)}</span>
            {data.totals.byCategory.map((c) => (
              <span key={c.category} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                {expenseCategoryLabel(c.category)}: {formatTRY(c.amountKurus)}
              </span>
            ))}
          </div>
        )}
        {!data ? (
          <p className="text-slate-500">Yükleniyor…</p>
        ) : data.items.length === 0 ? (
          <p className="text-slate-500">Bu ay için gider yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm" data-testid="expense-list">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="py-2 font-medium">Tarih</th>
                  <th className="py-2 font-medium">Kategori</th>
                  <th className="py-2 font-medium">Açıklama</th>
                  <th className="py-2 text-right font-medium">Tutar</th>
                  <th className="py-2 text-right font-medium">KDV</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2">{formatBusinessDate(e.businessDate)}</td>
                    <td className="py-2">{expenseCategoryLabel(e.category)}</td>
                    <td className="py-2 text-slate-600">{e.description}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatTRY(e.amountKurus)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{e.vatRate ? `%${e.vatRate} · ${formatTRY(e.vatKurus)}` : "—"}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button type="button" disabled={busy} onClick={() => edit(e)} className="rounded-lg px-2 py-1 text-sm text-emerald-800 hover:bg-emerald-50">
                        Düzelt
                      </button>
                      <button type="button" disabled={busy} onClick={() => void remove(e)} className="rounded-lg px-2 py-1 text-sm text-red-700 hover:bg-red-50">
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
