"use client";

import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";

const field = "mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-lg";

function errText(e: unknown, fallback: string) {
  if (!(e instanceof ApiError)) return fallback;
  const d = e.details as { issues?: { message: string }[] } | undefined;
  return d?.issues?.map((i) => i.message).join(" ") || e.message;
}

export function AccountScreen({ id, initialName, initialUsername }: { id: number; initialName: string; initialUsername: string }) {
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveProfile() {
    setBusy(true);
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: { name: name.trim(), username: username.trim() } });
      setNotice({ kind: "success", text: "Bilgileriniz kaydedildi. Menüdeki ad bir sonraki girişte güncellenir." });
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Kaydedilemedi.") });
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (next !== next2) return setNotice({ kind: "error", text: "Yeni şifreler aynı değil." });
    setBusy(true);
    try {
      await api("/api/account/password", { body: { currentPassword: current, newPassword: next, newPasswordConfirm: next2 } });
      setCurrent("");
      setNext("");
      setNext2("");
      setNotice({ kind: "success", text: "Şifreniz değiştirildi. Diğer cihazlardaki oturumlarınız kapandı." });
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Şifre değiştirilemedi.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Hesabım</h1>
      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile();
          }}
          className="space-y-3 rounded-2xl bg-white p-4 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Bilgilerim</h2>
          <label className="block text-sm font-medium text-slate-700">
            Ad
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Kullanıcı adı
            <input autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
          </label>
          <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 font-bold text-white disabled:bg-slate-300">
            Kaydet
          </button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void savePassword();
          }}
          className="space-y-3 rounded-2xl bg-white p-4 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Şifre değiştir</h2>
          <label className="block text-sm font-medium text-slate-700">
            Mevcut şifre
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Yeni şifre (en az 8 karakter)
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Yeni şifre (tekrar)
            <input type="password" autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} className={field} />
          </label>
          <button type="submit" disabled={busy || !current || !next} className="h-12 w-full rounded-xl bg-slate-900 font-bold text-white disabled:bg-slate-300">
            Şifreyi değiştir
          </button>
        </form>
      </div>
      <p className="text-sm text-slate-500">
        Şifrenizi unutursanız: bilgisayardaki <strong>market-pos</strong> klasöründe <strong>Yönetici Şifresi Sıfırla</strong> dosyasına çift tıklayın.
      </p>
    </main>
  );
}
