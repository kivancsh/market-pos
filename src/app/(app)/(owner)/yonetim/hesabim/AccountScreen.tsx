"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/client/api";
import { CodeEntry, type Challenge } from "@/client/components/CodeEntry";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { SecretChangeDialog } from "@/client/components/SecretChangeDialog";
import { errText } from "@/client/errors";

const field = "mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-lg";

export function AccountScreen({
  id,
  initialName,
  initialUsername,
  initialEmail,
}: {
  id: number;
  initialName: string;
  initialUsername: string;
  initialEmail: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState(initialEmail);
  const [newEmail, setNewEmail] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [pwDialog, setPwDialog] = useState(false);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

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

  async function sendEmailCode() {
    setBusy(true);
    try {
      setChallenge(await api<Challenge>("/api/account/email/start", { body: { email: newEmail } }));
      setCode("");
      setNotice(null);
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Kod gönderilemedi.") });
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmail() {
    if (!challenge) return;
    setBusy(true);
    try {
      const r = await api<{ user: { email: string } }>("/api/account/email/verify", { body: { token: challenge.token, code } });
      setEmail(r.user.email);
      router.refresh(); // üstteki "e-posta adresi yok" şeridi kalksın
      setChallenge(null);
      setNewEmail("");
      setNotice({ kind: "success", text: `E-posta adresiniz ${r.user.email} olarak kaydedildi. Onay kodları ve günlük rapor buraya gelecek.` });
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Onaylanamadı.") });
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

        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Şifre</h2>
          <p className="text-sm text-slate-600">Şifre değiştirirken e-posta adresinize onay kodu gönderilir.</p>
          <button
            type="button"
            disabled={busy || !email}
            onClick={() => setPwDialog(true)}
            className="h-12 w-full rounded-xl bg-slate-900 font-bold text-white disabled:bg-slate-300"
            data-testid="account-change-password"
          >
            Şifremi değiştir
          </button>
          {!email && <p className="text-sm text-amber-700">Önce aşağıdan e-posta adresinizi ekleyin.</p>}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void (challenge ? confirmEmail() : sendEmailCode());
        }}
        className="space-y-3 rounded-2xl bg-white p-4 shadow-sm"
      >
        <h2 className="text-lg font-semibold">E-posta adresim</h2>
        <p className="text-sm text-slate-600">
          Şu an: <b data-testid="account-email">{email ?? "— (eklenmemiş)"}</b>. Onay kodları ve günlük rapor bu adrese gelir. Değiştirirken yeni adrese bir kod
          gönderilir; adresin size ait olduğu böyle doğrulanır.
        </p>
        {!challenge ? (
          <div className="flex flex-wrap gap-2">
            <input type="email" autoCapitalize="none" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="yeni@ornek.com" className={`${field} mt-0 flex-1`} data-testid="account-new-email" />
            <button type="submit" disabled={busy || !newEmail} className="h-12 rounded-xl bg-slate-900 px-5 font-bold text-white disabled:bg-slate-300">
              {email ? "Değiştir" : "Ekle"} (kod gönder)
            </button>
          </div>
        ) : (
          <>
            <CodeEntry challenge={challenge} code={code} onCode={setCode} onResend={() => void sendEmailCode()} busy={busy} />
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setChallenge(null)} className="h-12 flex-1 rounded-xl border border-slate-300 font-semibold">
                Vazgeç
              </button>
              <button type="submit" disabled={busy || code.length !== 6} className="h-12 flex-1 rounded-xl bg-emerald-600 font-bold text-white disabled:bg-slate-300">
                Onayla
              </button>
            </div>
          </>
        )}
      </form>

      <p className="text-sm text-slate-500">
        Şifrenizi unutursanız: giriş ekranında <strong>Şifremi unuttum</strong> (e-postanıza kod gelir) ya da kasa bilgisayarında <strong>Yönetici Şifresi Sıfırla</strong>.
      </p>

      {pwDialog && (
        <SecretChangeDialog
          self
          target={{ id, name, role: "owner", cashierNo: null, isActive: true }}
          onClose={() => setPwDialog(false)}
          onDone={(msg) => {
            setPwDialog(false);
            setNotice({ kind: "success", text: msg });
          }}
        />
      )}
    </main>
  );
}
