"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";

interface U {
  id: number;
  role: "owner" | "cashier";
  name: string;
  username: string | null;
  isActive: boolean;
}

const field = "h-11 rounded-lg border border-slate-300 px-3";

function errText(e: unknown, fallback: string) {
  if (!(e instanceof ApiError)) return fallback;
  const d = e.details as { issues?: { message: string }[] } | undefined;
  return d?.issues?.map((i) => i.message).join(" ") || e.message;
}

export function UsersScreen({ meId }: { meId: number }) {
  const [users, setUsers] = useState<U[] | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [kind, setKind] = useState<"cashier" | "owner">("cashier");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ items: U[] }>("/api/users")).items);
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Kullanıcılar yüklenemedi.") });
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

  async function add() {
    const body = kind === "cashier" ? { role: "cashier", name, pin } : { role: "owner", name, username, password };
    if (await run(() => api("/api/users", { body }), `${name} eklendi.`)) {
      setName("");
      setPin("");
      setUsername("");
      setPassword("");
    }
  }

  function changePin(u: U) {
    const p = window.prompt(`${u.name} için yeni PIN (4-8 rakam):`);
    if (p) void run(() => api(`/api/users/${u.id}`, { method: "PATCH", body: { pin: p.trim() } }), `${u.name}: PIN değiştirildi.`);
  }
  function changePassword(u: U) {
    const p = window.prompt(`${u.name} için yeni şifre (en az 8 karakter):`);
    if (p) void run(() => api(`/api/users/${u.id}`, { method: "PATCH", body: { password: p } }), `${u.name}: şifre değiştirildi.`);
  }
  function toggle(u: U) {
    if (u.isActive) {
      if (!window.confirm(`${u.name} pasife alınsın mı? Bu kişi artık giriş yapamaz.`)) return;
      void run(() => api(`/api/users/${u.id}`, { method: "PATCH", body: { isActive: false } }), `${u.name} pasife alındı.`);
    } else {
      const body: Record<string, unknown> = { isActive: true };
      if (u.role === "cashier") {
        const p = window.prompt(`${u.name} tekrar aktif olacak. Yeni PIN (4-8 rakam):`);
        if (!p) return;
        body.pin = p.trim();
      }
      void run(() => api(`/api/users/${u.id}`, { method: "PATCH", body }), `${u.name} tekrar aktif.`);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Kullanıcılar</h1>
      <p className="text-slate-600">Kasiyerler PIN ile, yöneticiler kullanıcı adı ve şifre ile girer. PIN/şifre değişince o kişinin açık oturumları kapanır.</p>
      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-4 shadow-sm"
      >
        <label className="flex flex-col text-sm font-medium">
          Tür
          <select value={kind} onChange={(e) => setKind(e.target.value as "cashier" | "owner")} className={field}>
            <option value="cashier">Kasiyer</option>
            <option value="owner">Yönetici</option>
          </select>
        </label>
        <label className="flex flex-col text-sm font-medium">
          Ad
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} data-testid="user-name" />
        </label>
        {kind === "cashier" ? (
          <label className="flex flex-col text-sm font-medium">
            PIN (4-8 rakam)
            <input inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} className={`${field} w-32`} data-testid="user-pin" />
          </label>
        ) : (
          <>
            <label className="flex flex-col text-sm font-medium">
              Kullanıcı adı
              <input autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col text-sm font-medium">
              Şifre (en az 8)
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            </label>
          </>
        )}
        <button type="submit" disabled={busy || !name} className="h-11 rounded-xl bg-emerald-600 px-5 font-bold text-white disabled:bg-slate-300" data-testid="user-add">
          Ekle
        </button>
      </form>

      {users === null ? (
        <p className="py-6 text-center text-slate-500">Yükleniyor…</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm" data-testid="user-list">
          {users.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center gap-2 p-3 ${u.isActive ? "" : "opacity-60"}`}>
              <span className="min-w-40 flex-1">
                <span className="font-semibold">{u.name}</span>
                {u.id === meId && <span className="ml-2 text-xs text-slate-500">(siz)</span>}
                <span className="block text-xs text-slate-500">
                  {u.role === "owner" ? `Yönetici · ${u.username}` : "Kasiyer · PIN ile giriş"} {u.isActive ? "" : "· pasif"}
                </span>
              </span>
              {u.role === "cashier" ? (
                <button type="button" disabled={busy || !u.isActive} onClick={() => changePin(u)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
                  PIN değiştir
                </button>
              ) : (
                u.id !== meId && (
                  <button type="button" disabled={busy || !u.isActive} onClick={() => changePassword(u)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
                    Şifre değiştir
                  </button>
                )
              )}
              {u.id !== meId && (
                <button type="button" disabled={busy} onClick={() => toggle(u)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
                  {u.isActive ? "Pasife al" : "Aktif yap"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
