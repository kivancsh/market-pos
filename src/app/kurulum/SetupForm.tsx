"use client";

import { useState } from "react";
import { api } from "@/client/api";
import { CodeEntry, type Challenge } from "@/client/components/CodeEntry";
import { errText } from "@/client/errors";

type Step = "mail" | "info" | "code";
type Provider = "gmail" | "outlook" | "icloud" | "yandex" | "custom";

const PROVIDERS: { key: Provider; label: string }[] = [
  { key: "gmail", label: "Gmail (önerilen)" },
  { key: "outlook", label: "Outlook / Hotmail" },
  { key: "icloud", label: "iCloud" },
  { key: "yandex", label: "Yandex" },
  { key: "custom", label: "Diğer (SMTP)" },
];

const field = "mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-lg";

/** İlk kurulum: ① e-posta gönderim hesabı ② yönetici bilgileri ③ e-postaya gelen kod. */
export function SetupForm({ mailConfigured, mailUser }: { mailConfigured: boolean; mailUser: string | null }) {
  const [step, setStep] = useState<Step>(mailConfigured ? "info" : "mail");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ① e-posta gönderimi
  const [provider, setProvider] = useState<Provider>("gmail");
  const [mailAddr, setMailAddr] = useState("");
  const [mailPass, setMailPass] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("465");
  const [sender, setSender] = useState(mailUser);

  // ② yönetici bilgileri
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(mailUser ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  // ③ kod
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");

  async function run(fn: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  const saveMail = () =>
    run(async () => {
      const body: Record<string, unknown> = { provider, user: mailAddr, pass: mailPass };
      if (provider === "custom") {
        body.host = host;
        body.port = Number(port);
      }
      const r = await api<{ mail: { user: string } }>("/api/setup/mail", { body });
      setSender(r.mail.user);
      if (!email) setEmail(r.mail.user);
      setStep("info");
    }, "E-posta hesabı bağlanamadı.");

  const sendCode = () =>
    run(async () => {
      if (password !== passwordConfirm) throw new Error("Şifreler aynı değil.");
      setChallenge(await api<Challenge>("/api/setup/start", { body: { name, username, email, password, passwordConfirm } }));
      setCode("");
      setStep("code");
    }, password !== passwordConfirm ? "Şifreler aynı değil." : "Kod gönderilemedi.");

  const verify = () =>
    run(async () => {
      await api("/api/setup/verify", { body: { token: challenge!.token, code } });
      window.location.replace("/yonetim?hosgeldin=1");
    }, "Hesap oluşturulamadı.");

  const steps = ["E-posta gönderimi", "Yönetici bilgileri", "Onay kodu"];
  const idx = step === "mail" ? 0 : step === "info" ? 1 : 2;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void (step === "mail" ? saveMail() : step === "info" ? sendCode() : verify());
      }}
      className="w-full max-w-md space-y-3 rounded-3xl bg-white p-6 shadow-xl"
    >
      <h1 className="text-2xl font-bold">Market Kasa&apos;ya hoş geldiniz</h1>
      <ol className="flex gap-2 text-xs font-semibold" aria-label="Kurulum adımları">
        {steps.map((s, i) => (
          <li key={s} className={`flex-1 rounded-lg px-2 py-1 text-center ${i === idx ? "bg-emerald-600 text-white" : i < idx ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === "mail" && (
        <>
          <p className="text-slate-600">
            Program; onay kodlarını ve <b>günlük raporu</b> e-postayla gönderir. Bunun için dükkânın e-posta hesabını bir kez bağlayın.
          </p>
          <label className="block text-sm font-medium text-slate-700">
            E-posta hizmeti
            <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className={field} data-testid="setup-mail-provider">
              {PROVIDERS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            E-posta adresi
            <input type="email" autoCapitalize="none" value={mailAddr} onChange={(e) => setMailAddr(e.target.value)} className={field} placeholder="dukkan@gmail.com" data-testid="setup-mail-user" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {provider === "gmail" ? "Uygulama şifresi (16 harf)" : "Şifre / uygulama şifresi"}
            <input type="password" autoComplete="off" value={mailPass} onChange={(e) => setMailPass(e.target.value)} className={field} data-testid="setup-mail-pass" />
          </label>
          {provider === "custom" && (
            <div className="flex gap-2">
              <label className="block flex-1 text-sm font-medium text-slate-700">
                SMTP sunucusu
                <input autoCapitalize="none" value={host} onChange={(e) => setHost(e.target.value)} className={field} placeholder="smtp.ornek.com" />
              </label>
              <label className="block w-24 text-sm font-medium text-slate-700">
                Port
                <input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className={field} />
              </label>
            </div>
          )}
          {provider === "gmail" && (
            <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
              <b>Gmail uygulama şifresi nasıl alınır?</b>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Telefonda ya da bilgisayarda Google hesabınıza girin: <b>myaccount.google.com</b></li>
                <li><b>Güvenlik</b> → <b>2 Adımlı Doğrulama</b>&apos;yı açın (kapalıysa).</li>
                <li>Arama kutusuna <b>Uygulama şifreleri</b> yazın, açın.</li>
                <li>Ad olarak <b>Market Kasa</b> yazıp <b>Oluştur</b>&apos;a basın.</li>
                <li>Çıkan 16 harfli şifreyi yukarıdaki kutuya yazın (boşluklar önemli değil).</li>
              </ol>
              <p className="mt-1">Normal Gmail şifreniz burada çalışmaz.</p>
            </div>
          )}
        </>
      )}

      {step === "info" && (
        <>
          <p className="text-slate-600">
            Şimdi <strong>yönetici hesabınızı</strong> oluşturun. Bu hesapla ürünleri, fiyatları, kasiyerleri ve tüm ayarları yönetirsiniz.
          </p>
          {sender && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              ✓ E-postalar <b>{sender}</b> hesabından gönderilecek.{" "}
              <button type="button" onClick={() => setStep("mail")} className="underline">
                Değiştir
              </button>
            </p>
          )}
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
            E-posta adresiniz (onay kodu buraya gelecek)
            <input type="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className={field} data-testid="setup-email" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Şifre (en az 8 karakter)
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} data-testid="setup-password" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Şifre (tekrar)
            <input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className={field} data-testid="setup-password2" />
          </label>
        </>
      )}

      {step === "code" && challenge && (
        <>
          <p className="text-slate-600">Son adım: e-posta adresinizin size ait olduğunu doğrulayın.</p>
          <CodeEntry challenge={challenge} code={code} onCode={setCode} onResend={() => void sendCode()} busy={busy} />
          <button type="button" onClick={() => setStep("info")} className="text-sm text-slate-600 underline">
            ← Bilgileri düzelt
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 font-medium text-red-900">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || (step === "code" && code.length !== 6)}
        className="h-14 w-full rounded-2xl bg-emerald-600 text-xl font-bold text-white disabled:bg-slate-300"
        data-testid="setup-submit"
      >
        {busy
          ? step === "mail"
            ? "Bağlanılıyor…"
            : step === "info"
              ? "Kod gönderiliyor…"
              : "Oluşturuluyor…"
          : step === "mail"
            ? "Bağlan ve devam et"
            : step === "info"
              ? "Onay kodu gönder"
              : "Yönetici hesabını oluştur"}
      </button>
      {step === "mail" && sender && (
        <button type="button" onClick={() => setStep("info")} className="w-full text-sm text-slate-600 underline">
          Değiştirmeden devam et ({sender})
        </button>
      )}
      <p className="text-xs text-slate-500">Şifrenizi bir yere not edin. Unutursanız giriş ekranındaki &quot;Şifremi unuttum&quot; ile e-postanıza kod gelir.</p>
    </form>
  );
}
