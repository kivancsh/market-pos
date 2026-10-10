"use client";

import { useEffect, useRef, useState } from "react";
import { CodeEntry, type Challenge } from "@/client/components/CodeEntry";
import { errText } from "@/client/errors";
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

const LAST_NO_KEY = "marketKasa.lastCashierNo";

/** Kasiyer girişi: Kasiyer No + PIN (tuş takımı ya da klavye). Son kullanılan No hatırlanır. */
function CashierPin({ next }: { next: string }) {
  const [no, setNo] = useState("");
  const [pin, setPin] = useState("");
  const [field, setField] = useState<"no" | "pin">("no");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Tuş olayları arka arkaya çok hızlı gelebilir (klavye/okuyucu): güncel değerler ekranın yenilenmesini beklemeden burada tutulur.
  const state = useRef({ no: "", pin: "", field: "no" as "no" | "pin" });
  const update = (patch: Partial<{ no: string; pin: string; field: "no" | "pin" }>) => {
    state.current = { ...state.current, ...patch };
    if (patch.no !== undefined) setNo(patch.no);
    if (patch.pin !== undefined) setPin(patch.pin);
    if (patch.field !== undefined) setField(patch.field);
  };

  // Son kullanılan Kasiyer No (sadece tarayıcıda; sunucu çizimiyle çakışmasın diye açıldıktan sonra)
  useEffect(() => {
    let last = "";
    try {
      last = window.localStorage.getItem(LAST_NO_KEY) ?? "";
    } catch {
      // tarayıcı kaydı kapalı
    }
    if (/^\d{1,6}$/.test(last)) {
      const t = window.setTimeout(() => update({ no: last, field: "pin" }), 0);
      return () => window.clearTimeout(t);
    }
  }, []);

  async function submit() {
    const { no: n, pin: p } = state.current;
    if (busy || n.length < 1 || p.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { mode: "cashier", cashierNo: n, pin: p } });
      try {
        window.localStorage.setItem(LAST_NO_KEY, n);
      } catch {
        // tarayıcı kaydı kapalı: önemli değil
      }
      window.location.replace(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Giriş yapılamadı.");
      update({ pin: "", field: "pin" });
      setBusy(false);
    }
  }

  function press(k: (typeof KEYS)[number]) {
    setError(null);
    const { field: f, no: n, pin: p } = state.current;
    if (f === "no") {
      if (k === "clear") update({ no: "" });
      else if (k === "back") update({ no: n.slice(0, -1) });
      else {
        const v = (n + k).slice(0, 6);
        update(v.length === 4 ? { no: v, field: "pin" } : { no: v });
      }
    } else if (k === "clear") update({ pin: "" });
    else if (k === "back") update(p.length === 0 ? { field: "no" } : { pin: p.slice(0, -1) });
    else if (p.length < MAX_LEN) update({ pin: p + k });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
      else if (e.key === "Tab") {
        e.preventDefault();
        update({ field: state.current.field === "no" ? "pin" : "no" });
      } else if (e.key === "Enter") {
        // Odaktaki düğme (ör. az önce dokunulan alan/tuş) Enter'la bir daha "tıklanmasın"
        e.preventDefault();
        if (state.current.field === "no" && state.current.no.length > 0) update({ field: "pin" });
        else document.getElementById("login-submit")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // press/update her şeyi state ref'inden okur; dinleyicinin bir kez kurulması yeterli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const box = (active: boolean) =>
    `flex h-14 items-center justify-center gap-3 rounded-2xl text-2xl font-bold ${active ? "bg-white ring-4 ring-emerald-400" : "bg-slate-100"}`;
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => update({ field: "no" })} className="text-left" aria-label="Kasiyer No">
          <span className="text-sm font-medium text-slate-600">Kasiyer No</span>
          <span className={box(field === "no")} data-testid="login-cashier-no">
            {no || <span className="text-base font-normal text-slate-400">ör. 1001</span>}
          </span>
        </button>
        <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => update({ field: "pin" })} className="text-left" aria-label="PIN">
          <span className="text-sm font-medium text-slate-600">PIN</span>
          <span className={box(field === "pin")} aria-live="polite" data-testid="login-pin">
            {pin.length === 0 ? (
              <span className="text-base font-normal text-slate-400">••••</span>
            ) : (
              Array.from({ length: pin.length }, (_, i) => <span key={i} className="h-3.5 w-3.5 rounded-full bg-slate-900" />)
            )}
          </span>
        </button>
      </div>
      <p role="alert" className="mt-3 min-h-6 text-center font-medium text-red-700">
        {error}
      </p>
      <div className="mt-1 grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
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
        disabled={busy || no.length < 1 || pin.length < 4}
        className="mt-4 h-16 w-full rounded-2xl bg-emerald-600 text-xl font-bold text-white active:bg-emerald-700 disabled:bg-slate-300"
      >
        {busy ? "Giriş yapılıyor…" : "Giriş"}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">Kasiyer No&apos;nuzu ve PIN&apos;inizi yöneticiniz verir. PIN&apos;i unuttuysanız yöneticinize söyleyin.</p>
    </>
  );
}

function OwnerPassword({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

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

  if (forgot) {
    return (
      <ForgotPassword
        initialUsername={username}
        onCancel={() => setForgot(false)}
        onDone={(u) => {
          setForgot(false);
          setUsername(u);
          setPassword("");
          setError(null);
          setInfo("Şifreniz değiştirildi. Yeni şifrenizle giriş yapın.");
        }}
      />
    );
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
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">{info}</p>}
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
      <button type="button" onClick={() => setForgot(true)} className="w-full text-center text-sm font-semibold text-emerald-800 underline" data-testid="login-forgot">
        Şifremi unuttum
      </button>
    </form>
  );
}

/** Şifremi unuttum: kullanıcı adı → e-postaya kod → kod + yeni şifre. */
function ForgotPassword({ initialUsername, onCancel, onDone }: { initialUsername: string; onCancel: () => void; onDone: (username: string) => void }) {
  const [username, setUsername] = useState(initialUsername);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setChallenge(await api<Challenge>("/api/auth/forgot/start", { body: { username } }));
      setCode("");
    } catch (e) {
      setError(errText(e, "Kod gönderilemedi."));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ username: string }>("/api/auth/forgot/verify", {
        body: { token: challenge.token, code, newPassword: pw, newPasswordConfirm: pw2 },
      });
      onDone(r.username);
    } catch (e) {
      setError(errText(e, "Şifre değiştirilemedi."));
      setBusy(false);
    }
  }

  const field = "mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-lg";
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void (challenge ? save() : send());
      }}
    >
      <h2 className="text-lg font-bold">Şifremi unuttum</h2>
      {!challenge ? (
        <>
          <p className="text-sm text-slate-600">Kullanıcı adınızı yazın; hesabınızdaki e-posta adresine bir onay kodu gönderilecek.</p>
          <label className="block text-sm font-medium text-slate-700">
            Kullanıcı adı
            <input autoFocus autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} className={field} data-testid="forgot-username" />
          </label>
          <button type="submit" disabled={busy || !username} className="h-14 w-full rounded-2xl bg-slate-900 text-lg font-bold text-white disabled:bg-slate-300" data-testid="forgot-send">
            {busy ? "Gönderiliyor…" : "Onay kodu gönder"}
          </button>
        </>
      ) : (
        <>
          <CodeEntry challenge={challenge} code={code} onCode={setCode} onResend={() => void send()} busy={busy} />
          <label className="block text-sm font-medium text-slate-700">
            Yeni şifre (en az 8 karakter)
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={field} data-testid="forgot-new" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Yeni şifre (tekrar)
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={field} data-testid="forgot-new2" />
          </label>
          <button type="submit" disabled={busy || code.length !== 6 || !pw} className="h-14 w-full rounded-2xl bg-emerald-600 text-lg font-bold text-white disabled:bg-slate-300" data-testid="forgot-save">
            {busy ? "Kaydediliyor…" : "Şifreyi değiştir"}
          </button>
        </>
      )}
      <p role="alert" className="min-h-6 text-center font-medium text-red-700">
        {error}
      </p>
      <button type="button" onClick={onCancel} className="w-full text-center text-sm text-slate-600 underline">
        ← Girişe dön
      </button>
      <p className="text-center text-xs text-slate-500">E-postanıza ulaşamıyorsanız: kasa bilgisayarında &quot;Yönetici Şifresi Sıfırla&quot;.</p>
    </form>
  );
}
