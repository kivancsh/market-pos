"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { SecretChangeDialog } from "@/client/components/SecretChangeDialog";
import { errText } from "@/client/errors";

interface U {
  id: number;
  role: "owner" | "cashier";
  name: string;
  username: string | null;
  email: string | null;
  cashierNo: number | null;
  isActive: boolean;
}

const field = "h-11 rounded-lg border border-slate-300 px-3";

export function UsersScreen({ meId }: { meId: number }) {
  const [users, setUsers] = useState<U[] | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [kind, setKind] = useState<"cashier" | "owner">("cashier");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ user: U; activate: boolean } | null>(null);
  const router = useRouter();

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
  // Değişiklikten sonra listeyi ve üstteki uyarı şeritlerini (sunucuda çizilen) tazele.
  const reload = useCallback(async () => {
    await load();
    router.refresh();
  }, [load, router]);

  async function add() {
    const body = kind === "cashier" ? { role: "cashier", name, pin } : { role: "owner", name, username, email, password };
    setBusy(true);
    try {
      const r = await api<{ user: U }>("/api/users", { body });
      setNotice({
        kind: "success",
        text:
          r.user.role === "cashier"
            ? `${r.user.name} eklendi. Kasiyer No: ${r.user.cashierNo}. Bu numarayı ve PIN'i kasiyere söyleyin; girişte ikisini de yazacak.`
            : `${r.user.name} yönetici olarak eklendi.`,
      });
      setName("");
      setPin("");
      setUsername("");
      setEmail("");
      setPassword("");
      await reload();
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Eklenemedi.") });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(u: U) {
    if (!window.confirm(`${u.name} pasife alınsın mı? Bu kişi artık giriş yapamaz.`)) return;
    setBusy(true);
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { isActive: false } });
      setNotice({ kind: "success", text: `${u.name} pasife alındı.` });
      await reload();
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "İşlem yapılamadı.") });
    } finally {
      setBusy(false);
    }
  }

  async function activateOwner(u: U) {
    setBusy(true);
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { isActive: true } });
      setNotice({ kind: "success", text: `${u.name} tekrar aktif.` });
      await reload();
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "İşlem yapılamadı.") });
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50";
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Kullanıcılar</h1>
      <p className="text-slate-600">
        Kasiyerler <b>Kasiyer No + PIN</b> ile, yöneticiler kullanıcı adı ve şifre ile girer. PIN ve şifre değiştirme yöneticidedir; her seferinde
        e-postanıza onay kodu gelir. PIN/şifre değişince o kişinin açık oturumları kapanır.
      </p>
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
              E-posta
              <input type="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
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
        {kind === "cashier" && <p className="w-full text-xs text-slate-500">Kasiyer No otomatik verilir (1001, 1002…).</p>}
      </form>

      {users === null ? (
        <p className="py-6 text-center text-slate-500">Yükleniyor…</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm" data-testid="user-list">
          {users.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center gap-2 p-3 ${u.isActive ? "" : "opacity-60"}`} data-testid={`user-row-${u.id}`}>
              {u.role === "cashier" && (
                <span className="rounded-lg bg-slate-900 px-2 py-1 font-mono text-sm font-bold text-white" title="Kasiyer No">
                  {u.cashierNo}
                </span>
              )}
              <span className="min-w-40 flex-1">
                <span className="font-semibold">{u.name}</span>
                {u.id === meId && <span className="ml-2 text-xs text-slate-500">(siz)</span>}
                <span className="block text-xs text-slate-500">
                  {u.role === "owner" ? `Yönetici · ${u.username}${u.email ? ` · ${u.email}` : " · e-posta yok"}` : `Kasiyer · No ${u.cashierNo} + PIN ile giriş`}{" "}
                  {u.isActive ? "" : "· pasif"}
                </span>
              </span>
              {u.isActive && u.id !== meId && (
                <button type="button" disabled={busy} onClick={() => setDialog({ user: u, activate: false })} className={btn}>
                  {u.role === "cashier" ? "PIN değiştir" : "Şifre değiştir"}
                </button>
              )}
              {u.id !== meId &&
                (u.isActive ? (
                  <button type="button" disabled={busy} onClick={() => void deactivate(u)} className={btn}>
                    Pasife al
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => (u.role === "cashier" ? setDialog({ user: u, activate: true }) : void activateOwner(u))}
                    className={btn}
                  >
                    Aktif yap
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-slate-500">Kendi şifrenizi ve e-postanızı Yönetim Paneli → Hesabım&apos;dan değiştirirsiniz.</p>

      {dialog && (
        <SecretChangeDialog
          target={dialog.user}
          activate={dialog.activate}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null);
            setNotice({ kind: "success", text: msg });
            void reload();
          }}
        />
      )}
    </main>
  );
}
