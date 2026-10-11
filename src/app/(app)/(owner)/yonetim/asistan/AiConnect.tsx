"use client";

import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { Modal } from "@/client/components/Modal";
import type { AiStatus } from "@/server/services/assistant/ai";

/**
 * Yapay zekâ bağlantısı: yönetici kendi Anthropic API anahtarını girer (şifreli saklanır, ekranda bir daha gösterilmez).
 * `compact`: bağlıyken küçük "Ayarlar" bağlantısı; açılır pencerede aç/kapat ve kaldır.
 */
export function AiConnect({ status, onChange, compact = false }: { status: AiStatus; onChange: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (compact) {
    return (
      <>
        <button type="button" className="font-semibold text-emerald-800 underline" onClick={() => setOpen(true)} data-testid="ai-settings-open">
          bağlantı ayarları
        </button>
        {open && (
          <Modal title="Yapay zekâ bağlantısı" onClose={() => setOpen(false)}>
            <Form status={status} onDone={() => (setOpen(false), onChange())} />
          </Modal>
        )}
      </>
    );
  }
  return (
    <section className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-4 print:hidden" aria-label="Yapay zekâyı bağlayın" data-testid="ai-connect">
      <h2 className="text-lg font-semibold">Yapay zekâyı bağlayın (isteğe bağlı)</h2>
      <p className="mt-1 text-sm text-slate-700">
        Rapor yapay zekâ olmadan da hazırlanır: bütün rakamlar, hedefler ve kural tabanlı öneriler bu bilgisayarda hesaplanır. Yapay zekâ
        (Anthropic Claude) bağlanırsa bu rakamları bir danışman gibi yorumlar, personeli değerlendirir ve haftalara bölünmüş bir aksiyon planı yazar.
      </p>
      <Form status={status} onDone={onChange} />
    </section>
  );
}

function Form({ status, onDone }: { status: AiStatus; onDone: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/assistant/ai-settings", { method: "PUT", body });
      setKey("");
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 text-sm">
      {status.configured && (
        <p>
          Bağlı anahtar: <code className="rounded bg-slate-100 px-1">{status.keyHint}</code> · model {status.model}
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-slate-700">
        <li>
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="font-semibold text-emerald-800 underline">
            console.anthropic.com
          </a>{" "}
          adresinde hesap açın, Billing bölümünden kredi yükleyin (kullandıkça ödenir; ayda bir rapor düşük tutarlıdır).
        </li>
        <li>API Keys → “Create Key” ile anahtar oluşturun ve aşağıya yapıştırın. Anahtar bu bilgisayarda şifreli saklanır.</li>
        <li>Yapay zekâya yalnız rakamlar ve ürün adları gider; kasiyer adları gitmez (“Kasiyer 1001” olarak geçer), müşteri bilgisi zaten tutulmaz.</li>
      </ol>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ apiKey: key });
        }}
      >
        <input
          type="password"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 font-mono"
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="Anthropic API anahtarı"
          data-testid="ai-key"
        />
        <button type="submit" disabled={busy || key.trim().length < 10} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50" data-testid="ai-key-save">
          {busy ? "Deneniyor…" : status.configured ? "Anahtarı değiştir" : "Bağla"}
        </button>
      </form>
      {status.configured && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void send({ enabled: !status.enabled })} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold">
            {status.enabled ? "Yapay zekâ yorumunu kapat" : "Yapay zekâ yorumunu aç"}
          </button>
          <button type="button" disabled={busy} onClick={() => void send({ remove: true })} className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold text-red-700">
            Bağlantıyı kaldır
          </button>
        </div>
      )}
      {error && <p className="font-semibold text-red-700">{error}</p>}
    </div>
  );
}
