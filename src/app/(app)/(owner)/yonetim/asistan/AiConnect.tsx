"use client";

import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { Modal } from "@/client/components/Modal";
import type { AiStatus } from "@/server/services/assistant/ai";

/**
 * Bulut yapay zekâ ayarı (yalnız Optiva servisi tanımlı kurulumlarda görünür). Dükkânda hesap ya da anahtar gerekmez;
 * yönetici yalnızca açıp kapatır. Kapalıyken rapor verisi servise hiç gitmez, yerleşik asistan çalışır.
 */
export function AiConnect({ status, onChange }: { status: AiStatus; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/assistant/ai-settings", { method: "PUT", body: { cloudEnabled: !status.cloudEnabled } });
      setOpen(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="font-semibold text-emerald-800 underline" onClick={() => setOpen(true)} data-testid="ai-settings-open">
        ayarlar
      </button>
      {open && (
        <Modal title="Asistan ayarları" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3 text-sm text-slate-700">
            <p>
              <b>Yerleşik asistan</b> her zaman çalışır: rakamları, notları, personel değerlendirmesini ve haftalık planı bu bilgisayarda, internetsiz
              hazırlar.
            </p>
            <p>
              <b>Bulut yapay zekâ</b> açıkken rapor, Optiva servisi üzerinden yapay zekâ (Claude) ile daha derin yorumlanır. Sizin bir hesap
              açmanız gerekmez. Servise yalnızca hesaplanmış rakamlar ve ürün adları gider; kasiyer adları gitmez (“Kasiyer 1001” olarak geçer),
              müşteri bilgisi zaten tutulmaz.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggle()}
              className={`rounded-xl px-4 py-2 font-bold disabled:opacity-50 ${status.cloudEnabled ? "border border-slate-300" : "bg-emerald-600 text-white"}`}
              data-testid="ai-cloud-toggle"
            >
              {status.cloudEnabled ? "Bulut yapay zekâyı kapat" : "Bulut yapay zekâyı aç"}
            </button>
            {error && <p className="font-semibold text-red-700">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
