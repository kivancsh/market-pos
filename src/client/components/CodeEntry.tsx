"use client";

import { useEffect, useState } from "react";

export interface Challenge {
  token: string;
  emailMasked: string;
  expiresAt: string;
}

/** E-postaya gönderilen 6 haneli onay kodunun girildiği kutu + "kodu tekrar gönder" (60 sn sonra). */
export function CodeEntry({
  challenge,
  code,
  onCode,
  onResend,
  busy,
}: {
  challenge: Challenge;
  code: string;
  onCode: (v: string) => void;
  onResend: () => void;
  busy?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [sentAt] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const wait = Math.max(0, 60 - Math.floor((now - sentAt) / 1000));
  return (
    <div className="space-y-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm text-emerald-900">
        Onay kodu <b>{challenge.emailMasked}</b> adresine gönderildi. E-postanızı açın ve 6 haneli kodu yazın (10 dakika geçerli). Gelen
        kutusunda yoksa &quot;Gereksiz/Spam&quot; klasörüne bakın.
      </p>
      <input
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => onCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="______"
        aria-label="Onay kodu"
        className="h-14 w-full rounded-xl border-2 border-emerald-400 bg-white text-center font-mono text-3xl tracking-[0.5em]"
        data-testid="code-input"
      />
      <button
        type="button"
        onClick={onResend}
        disabled={busy || wait > 0}
        className="text-sm font-semibold text-emerald-800 underline disabled:text-slate-400 disabled:no-underline"
        data-testid="code-resend"
      >
        {wait > 0 ? `Kodu tekrar gönder (${wait} sn)` : "Kodu tekrar gönder"}
      </button>
    </div>
  );
}
