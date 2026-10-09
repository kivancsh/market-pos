"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/client/api";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;
const MAX_LEN = 8;

type Mode = "cashier" | "owner";

export function LoginForm({ next, businessName, initialMode }: { next: string; businessName: string; initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  return (
    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
      <h1 className="text-center text-2xl font-bold text-slate-900">{businessName}</h1>
      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-300" role="tablist" aria-label="Giriş türü">
        {(["cashier", "owner"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`h-12 text-base font-semibold ${mode === m ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
            data-testid={`login-tab-${m}`}
          >
            {m === "cashier" ? "Kasiyer" : "Yönetici"}
          </button>
        ))}
      </div>
      {mode === "cashier" ? <CashierPin next={next} /> : <OwnerPassword next={next} />}
    </div>
  );
}

function CashierPin({ next }: { next: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value = pin) {
    if (busy || value.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { mode: "cashier", pin: value } });
      window.location.replace(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Giriş yapılamadı.");
      setPin("");
      setBusy(false);
    }
  }

  function press(k: (typeof KEYS)[number]) {
    setError(null);
    if (k === "clear") setPin("");
    else if (k === "back") setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < MAX_LEN ? p + k : p));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
      else if (e.key === "Enter") document.getElementById("login-submit")?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <p className="mt-4 text-center text-slate-600">Kasiyer PIN&apos;inizi girin</p>
      <div className="mt-3 flex h-16 items-center justify-center gap-3 rounded-2xl bg-slate-100" aria-live="polite">
        {pin.length === 0 ? (
          <span className="text-slate-400">••••</span>
        ) : (
          Array.from({ length: pin.length }, (_, i) => <span key={i} className="h-4 w-4 rounded-full bg-slate-900" />)
        )}
      </div>
      <p role="alert" className="mt-3 min-h-6 text-center font-medium text-red-700">
        {error}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="h-16 rounded-2xl bg-slate-100 text-2xl font-semibold text-slate-900 active:bg-slate-300 disabled:opacity-50"
            disabled={busy}
            aria-label={k === "clear" ? "Temizle" : k === "back" ? "Sil" : k}
          >
            {k === "clear" ? "C" : k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>
      <button
        id="login-submit"
        type="button"
        onClick={() => void submit()}
        disabled={busy || pin.length < 4}
        className="mt-4 h-16 w-full rounded-2xl bg-emerald-600 text-xl font-bold text-white active:bg-emerald-700 disabled:bg-slate-300"
      >
        {busy ? "Giriş yapılıyor…" : "Giriş"}
      </button>
    </>
  );
}

function OwnerPassword({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !username || !password) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { mode: "owner", username, password } });
      window.location.replace(next === "/kasa" ? "/" : next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Giriş yapılamadı.");
      setPassword("");
      setBusy(false);
    }
  }

  const field = "mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-lg";
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block text-sm font-medium text-slate-700">
        Kullanıcı adı
        <input autoFocus autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} className={field} data-testid="login-username" />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Şifre
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} data-testid="login-password" />
      </label>
      <p role="alert" className="min-h-6 text-center font-medium text-red-700">
        {error}
      </p>
      <button type="submit" disabled={busy || !username || !password} className="h-14 w-full rounded-2xl bg-emerald-600 text-xl font-bold text-white disabled:bg-slate-300" data-testid="login-owner-submit">
        {busy ? "Giriş yapılıyor…" : "Yönetici girişi"}
      </button>
      <p className="text-center text-xs text-slate-500">Şifrenizi unuttuysanız: bilgisayardaki market-pos klasöründe &quot;Yönetici Şifresi Sıfırla&quot;.</p>
    </form>
  );
}
