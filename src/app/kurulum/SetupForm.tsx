"use client";

import { useState } from "react";
import { api, ApiError } from "@/client/api";

export function SetupForm() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (password !== passwordConfirm) return setError("Şifreler aynı değil.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/setup", { body: { name, username, password, passwordConfirm } });
      window.location.replace("/yonetim?hosgeldin=1");
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { issues?: { message: string }[] } | undefined) : undefined;
      setError(details?.issues?.map((i) => i.message).join(" ") || (e instanceof ApiError ? e.message : "Kurulum yapılamadı."));
      setBusy(false);
    }
  }

  const field = "mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-lg";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="w-full max-w-md space-y-3 rounded-3xl bg-white p-6 shadow-xl"
    >
      <h1 className="text-2xl font-bold">Market Kasa&apos;ya hoş geldiniz</h1>
      <p className="text-slate-600">
        Önce <strong>yönetici hesabınızı</strong> oluşturun. Bu hesapla ürünleri, fiyatları, kasiyerleri ve tüm ayarları yönetirsiniz.
      </p>
      <label className="block text-sm font-medium text-slate-700">
        Adınız
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="ör. Ayşe Yılmaz" data-testid="setup-name" />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Kullanıcı adı (girişte kullanılır)
        <input autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={field} placeholder="ör. ayse" data-testid="setup-username" />
        <span className="mt-1 block text-xs text-slate-500">Türkçe karakter ve boşluk olmadan; harf, rakam, nokta, tire.</span>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Şifre (en az 8 karakter)
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} data-testid="setup-password" />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Şifre (tekrar)
        <input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className={field} data-testid="setup-password2" />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 font-medium text-red-900">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="h-14 w-full rounded-2xl bg-emerald-600 text-xl font-bold text-white disabled:bg-slate-300" data-testid="setup-submit">
        {busy ? "Oluşturuluyor…" : "Yönetici hesabını oluştur"}
      </button>
      <p className="text-xs text-slate-500">Şifrenizi bir yere not edin. Unutursanız bilgisayardaki &quot;Yönetici Şifresi Sıfırla&quot; ile yenileyebilirsiniz.</p>
    </form>
  );
}
