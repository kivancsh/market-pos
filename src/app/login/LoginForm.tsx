"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/client/api";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;
const MAX_LEN = 8;

export function LoginForm({ next, businessName }: { next: string; businessName: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value = pin) {
    if (busy || value.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ role: string }>("/api/auth/login", { body: { pin: value } });
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
    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
      <h1 className="text-center text-2xl font-bold text-slate-900">{businessName}</h1>
      <p className="mt-1 text-center text-slate-600">PIN kodunuzu girin</p>

      <div className="mt-6 flex h-16 items-center justify-center gap-3 rounded-2xl bg-slate-100" aria-live="polite">
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
    </div>
  );
}
