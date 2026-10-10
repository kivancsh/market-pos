"use client";

import { useState } from "react";
import { api } from "@/client/api";
import { CodeEntry, type Challenge } from "@/client/components/CodeEntry";
import { Modal } from "@/client/components/Modal";
import { errText } from "@/client/errors";

export interface SecretTarget {
  id: number;
  name: string;
  role: "owner" | "cashier";
  cashierNo: number | null;
  isActive: boolean;
}

/**
 * Şifre / PIN değiştirme (ve pasif kasiyeri yeni PIN'le aktif etme): önce yöneticinin e-postasına kod gider,
 * kod + yeni şifre/PIN girilince değişir.
 */
export function SecretChangeDialog({
  target,
  self = false,
  activate = false,
  onDone,
  onClose,
}: {
  target: SecretTarget;
  self?: boolean;
  activate?: boolean;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const isPin = target.role === "cashier";
  const label = isPin ? "PIN" : "şifre";
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setChallenge(await api<Challenge>(`/api/users/${target.id}/secret/start`, { body: {} }));
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
      await api(`/api/users/${target.id}/secret/verify`, {
        body: { token: challenge.token, code, secret, secretConfirm: confirm, activate },
      });
      onDone(
        activate
          ? `${target.name} yeni PIN'le tekrar aktif.`
          : self
            ? "Şifreniz değiştirildi. Diğer cihazlardaki oturumlarınız kapandı."
            : `${target.name}: ${label} değiştirildi. Açık oturumları kapandı.`,
      );
    } catch (e) {
      setError(errText(e, "Kaydedilemedi."));
      setBusy(false);
    }
  }

  const field = "mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-lg";
  const who = isPin ? `${target.name} (Kasiyer No ${target.cashierNo})` : self ? "kendi hesabınız" : target.name;
  return (
    <Modal title={activate ? `${target.name}: tekrar aktif yap` : `${self ? "Şifremi" : `${target.name}: ${label}`} değiştir`} onClose={busy ? undefined : onClose}>
      <div className="space-y-3">
        {!challenge ? (
          <>
            <p className="text-slate-700">
              Güvenlik için <b>e-posta adresinize bir onay kodu</b> gönderilecek. Kodu ve {who} için yeni {label}i girince değişiklik yapılır.
            </p>
            <button type="button" onClick={() => void send()} disabled={busy} className="h-12 w-full rounded-xl bg-slate-900 font-bold text-white disabled:bg-slate-300" data-testid="secret-send-code">
              {busy ? "Gönderiliyor…" : "Onay kodu gönder"}
            </button>
          </>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <CodeEntry challenge={challenge} code={code} onCode={setCode} onResend={() => void send()} busy={busy} />
            <label className="block text-sm font-medium text-slate-700">
              Yeni {label} {isPin ? "(4-8 rakam)" : "(en az 8 karakter)"}
              <input type="password" inputMode={isPin ? "numeric" : undefined} autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} className={field} data-testid="secret-new" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Yeni {label} (tekrar)
              <input type="password" inputMode={isPin ? "numeric" : undefined} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} data-testid="secret-confirm" />
            </label>
            <button type="submit" disabled={busy || code.length !== 6 || !secret} className="h-12 w-full rounded-xl bg-emerald-600 font-bold text-white disabled:bg-slate-300" data-testid="secret-save">
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 font-medium text-red-900">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
