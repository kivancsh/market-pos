"use client";

import { useEffect, useState } from "react";
import { formatIstanbulDateTime } from "@/lib/businessDate";
import { api } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { errText } from "@/client/errors";
import type { UpdateInfo } from "@/server/update";

const DOWNLOAD_PAGE = "https://github.com/kivancsh/market-pos/releases/latest";

/** Windows'taki Market Kasa penceresi bu nesneyi sayfaya ekler (güncellemeyi o kurar). */
interface Host {
  installUpdate?: boolean;
}
declare global {
  interface Window {
    marketKasaHost?: Host;
    chrome?: { webview?: { postMessage: (message: string) => void } };
  }
}

function hostCanInstall(): boolean {
  return Boolean(window.marketKasaHost?.installUpdate && window.chrome?.webview);
}

/** Program sürümü ve güncelleme: denetle → (yedek + indir + doğrula) → pencere kapanır, kurulur, yeniden açılır. */
export function UpdateSection({ initial }: { initial: UpdateInfo }) {
  const [info, setInfo] = useState(initial);
  const [inWindow, setInWindow] = useState(false);
  const [busy, setBusy] = useState<null | "check" | "download">(null);
  const [installing, setInstalling] = useState(false);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);

  // Pencere bilgisi sadece tarayıcıda okunur (sunucu çizimiyle çakışmasın diye açıldıktan sonra)
  useEffect(() => {
    const t = window.setTimeout(() => setInWindow(hostCanInstall()), 0);
    return () => window.clearTimeout(t);
  }, []);

  async function check() {
    setBusy("check");
    setNotice(null);
    try {
      const r = await api<{ update: UpdateInfo }>("/api/update/check", { body: {} });
      setInfo(r.update);
      if (r.update.error) setNotice({ kind: "error", text: r.update.error });
      else if (!r.update.available) setNotice({ kind: "success", text: "Program güncel." });
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Denetlenemedi.") });
    } finally {
      setBusy(null);
    }
  }

  async function install() {
    if (!info.latest) return;
    const ok = window.confirm(
      `Market Kasa ${info.latest.version} sürümüne güncellensin mi?\n\n` +
        "• Önce otomatik yedek alınır.\n" +
        "• Program 1–2 dakika kapanır, sonra kendiliğinden açılır. Bu sırada kasa ve telefon bağlantısı çalışmaz.\n" +
        "• Satış yapılmıyorken güncelleyin.",
    );
    if (!ok) return;
    setBusy("download");
    setNotice(null);
    try {
      const r = await api<{ version: string; backup: string; update: UpdateInfo }>("/api/update/download", { body: {} });
      setInfo(r.update);
      setInstalling(true);
      window.chrome?.webview?.postMessage("market-kasa:install-update");
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Güncelleme indirilemedi.") });
    } finally {
      setBusy(null);
    }
  }

  const latest = info.latest;
  return (
    <section id="guncelleme" className="scroll-mt-20 rounded-2xl bg-white p-4 shadow-sm" aria-label="Program güncellemesi">
      <h2 className="text-lg font-semibold">Program sürümü ve güncelleme</h2>
      <p className="mt-1 text-sm text-slate-600">
        Çalışan sürüm: <b data-testid="app-version">{info.current}</b>
        {info.channel === "dev" && " (proje klasöründen çalışıyor)"}
        {info.checkedAt && <> · Son denetim: {formatIstanbulDateTime(info.checkedAt)}</>}
      </p>
      {notice && (
        <div className="mt-2">
          <Notice kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        </div>
      )}

      {!info.enabled ? (
        <p className="mt-2 text-sm text-slate-600">
          Bu bilgisayarda program, proje klasörü GitHub&apos;dan yenilenerek güncellenir (Mac). Windows kurulumunda program yeni sürümü kendisi bulur.
        </p>
      ) : installing ? (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3 font-medium text-emerald-900" role="status" data-testid="update-installing">
          Güncelleme kuruluyor. Pencere kapanacak; 1–2 dakika sonra Market Kasa yeni sürümüyle kendiliğinden açılacak.
        </p>
      ) : (
        <>
          {info.available && latest ? (
            <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3" data-testid="update-available">
              <p className="font-semibold text-emerald-900">Yeni sürüm var: {latest.version}</p>
              {latest.notes && <p className="mt-1 whitespace-pre-line text-sm text-emerald-900">{latest.notes}</p>}
              {info.canDownload && inWindow ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void install()}
                  className="mt-2 h-11 rounded-xl bg-emerald-600 px-5 font-bold text-white disabled:bg-slate-300"
                  data-testid="update-install"
                >
                  {busy === "download" ? "Yedek alınıp indiriliyor…" : "Güncelle"}
                </button>
              ) : (
                <p className="mt-2 text-sm text-emerald-900">
                  Güncellemeyi kasa bilgisayarındaki <b>Market Kasa penceresinden</b> yapın (Ayarlar → Güncelle). Ya da yeni kurulum dosyasını{" "}
                  <a href={DOWNLOAD_PAGE} target="_blank" rel="noreferrer" className="underline">
                    buradan indirip
                  </a>{" "}
                  çalıştırın; bilgileriniz silinmez.
                </p>
              )}
            </div>
          ) : (
            info.checkedAt && !info.error && <p className="mt-2 text-sm text-slate-600">Program güncel.</p>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void check()}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60"
            data-testid="update-check"
          >
            {busy === "check" ? "Denetleniyor…" : "Güncellemeleri denetle"}
          </button>
        </>
      )}
    </section>
  );
}
