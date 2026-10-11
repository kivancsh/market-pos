"use client";

import { useState, useSyncExternalStore } from "react";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { OKC_MODE_LABELS, type OkcMode } from "@/lib/okc";

const OPTIONS: { mode: OkcMode; hint: string; disabled?: boolean }[] = [
  { mode: "off", hint: "Yazar kasa kullanmıyorum ya da yazar kasadan muafım. Program yalnız iç takip yapar." },
  {
    mode: "manual",
    hint: "Fişi yazar kasadan ayrıca kesiyorum. Her satıştan sonra hatırlatılır; gün sonunda yazar kasanın Z toplamı programla karşılaştırılır.",
  },
  {
    mode: "hugin_cloud",
    hint: "Hugin yazar kasa satışı programdan alır, ödemeyi kendisi alıp yasal fişi basar; fiş numarası programa geri gelir.",
  },
  {
    mode: "pavo_rest",
    hint: "Pavo'nun entegrasyon belgesi alınınca açılacak. Şimdilik “Yazar kasayı ayrı kullanıyorum”u seçin.",
    disabled: true,
  },
  { mode: "simulator", hint: "Cihaz olmadan denemek ve kasiyerleri eğitmek için: yazar kasa ekranda taklit edilir." },
];

/** Ayarlar → Yazar kasa (ÖKC) bağlantısı. */
export function OkcSection({ initialMode }: { initialMode: OkcMode }) {
  const [mode, setMode] = useState<OkcMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [key, setKey] = useState<string | null>(null);

  async function choose(next: OkcMode) {
    if (next === mode) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ okcMode: OkcMode }>("/api/settings", { method: "PATCH", body: { okcMode: next } });
      setMode(r.okcMode);
      setNotice({ kind: "success", text: `Yazar kasa: ${OKC_MODE_LABELS[r.okcMode]}. Açık kasa ekranlarını yenileyin (F5).` });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  }

  async function loadKey(rotate: boolean) {
    setBusy(true);
    try {
      const r = await api<{ key: string }>("/api/okc/hugin-key", rotate ? { method: "POST", body: {} } : {});
      setKey(r.key);
      if (rotate) setNotice({ kind: "success", text: "Yeni şifre üretildi. Eski şifre artık çalışmaz; yenisini Hugin'e bildirin." });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Şifre alınamadı." });
    } finally {
      setBusy(false);
    }
  }

  // Sunucuda boş, tarayıcıda bu bilgisayarın adresi (hidrasyon uyumsuzluğu olmadan)
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const localUrl = `${origin}/hugin/v1`;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Yazar kasa" data-testid="okc-section">
      <h2 className="text-lg font-semibold">Yazar kasa (ÖKC) bağlantısı</h2>
      <p className="mt-1 text-sm text-slate-600">
        Yasal fiş yeni nesil yazar kasadan kesilir. Program yazar kasaya bağlanırsa satış tutarı ve KDV yazar kasaya değişmeden gider,
        ödeme yazar kasada alınır, kesilen fişin numarası programa kaydedilir. Fiş kesilmezse satış iptal edilir.
      </p>
      {notice && (
        <div className="mt-2">
          <Notice kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Yazar kasa çalışma şekli">
        {OPTIONS.map((o) => (
          <label
            key={o.mode}
            className={`flex items-start gap-3 rounded-xl border-2 p-3 ${mode === o.mode ? "border-emerald-500 bg-emerald-50" : "border-slate-200"} ${o.disabled ? "opacity-60" : "cursor-pointer"}`}
          >
            <input
              type="radio"
              name="okc-mode"
              className="mt-1 h-5 w-5"
              checked={mode === o.mode}
              disabled={busy || o.disabled}
              onChange={() => void choose(o.mode)}
              data-testid={`okc-mode-${o.mode}`}
            />
            <span>
              <span className="font-semibold">
                {OKC_MODE_LABELS[o.mode]}
                {o.disabled && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs">yakında</span>}
              </span>
              <span className="block text-sm text-slate-600">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "hugin_cloud" && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm" data-testid="okc-hugin-setup">
          <p className="font-semibold">Hugin kurulumu (bir kez)</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-700">
            <li>Hugin yazar kasanızın Cloud Link desteklediğini ve entegrasyon anlaşmasının yapıldığını Hugin’den teyit edin.</li>
            <li>
              Hugin’e bildirilecek adres: <code className="rounded bg-white px-1">{localUrl}</code> — yazar kasa bu adrese internet üzerinden
              (HTTPS) ulaşmalı; dükkân dışından erişim için bir köprü adresi gerekir (kurulumda yardım alın).
            </li>
            <li>
              Hugin’e bildirilecek şifre (X-ApiKey):{" "}
              {key ? (
                <code className="select-all rounded bg-white px-1 font-mono" data-testid="okc-hugin-key">
                  {key}
                </code>
              ) : (
                <button type="button" disabled={busy} onClick={() => void loadKey(false)} className="font-semibold text-emerald-800 underline">
                  Göster
                </button>
              )}
              {key && (
                <button type="button" disabled={busy} onClick={() => void loadKey(true)} className="ml-2 text-xs font-semibold text-red-700 underline">
                  Yeni şifre üret
                </button>
              )}
            </li>
            <li>Bağlantıyı denemek için kasada küçük bir satış yapın: yazar kasada “Siparişler” listesinde görünmeli.</li>
          </ol>
        </div>
      )}
      {mode === "manual" && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Her satışı yazar kasaya da girmeniz gerekir. Gün sonunda yazar kasanın Z raporundaki toplamı “Günü Kapat” ekranına yazın; fark %5’i
          geçerse program uyarır.
        </p>
      )}
    </section>
  );
}
