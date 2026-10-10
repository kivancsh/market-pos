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

const MAC_WAIT_MS = 20 * 60_000;

/**
 * Program sürümü ve güncelleme: denetle → (yedek + indir + doğrula) →
 * Windows: pencere kapanır, kurulur, yeniden açılır · Mac: arka planda kurulur, sayfa yeni sürüm gelince yenilenir.
 */
export function UpdateSection({ initial }: { initial: UpdateInfo }) {
  const [info, setInfo] = useState(initial);
  const [inWindow, setInWindow] = useState(false);
  const [busy, setBusy] = useState<null | "check" | "download">(null);
  const [installing, setInstalling] = useState<null | { target: string; startedAt: number }>(null);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);

  // Pencere bilgisi sadece tarayıcıda okunur (sunucu çizimiyle çakışmasın diye açıldıktan sonra)
  useEffect(() => {
    const t = window.setTimeout(() => setInWindow(hostCanInstall()), 0);
    return () => window.clearTimeout(t);
  }, []);

  // Mac: program kapanıp yeni sürümle açılana kadar bekle; gelince sayfayı yenile, geri alındıysa nedenini göster
  useEffect(() => {
    if (!installing || info.channel !== "mac") return;
    let stop = false;
    const poll = async () => {
      if (stop) return;
      try {
        const r = await api<{ update: UpdateInfo }>("/api/update");
        const last = r.update.lastInstall;
        if (r.update.current === installing.target) {
          window.location.reload();
          return;
        }
        if (last && !last.ok && Date.parse(last.at) >= installing.startedAt) {
          setInfo(r.update);
          setInstalling(null);
          setNotice({ kind: "error", text: `Güncelleme yapılamadı: ${last.error ?? "bilinmeyen hata"} Program eski sürümle çalışmaya devam ediyor.` });
          return;
        }
      } catch {
        // program şu an kapalı (güncelleniyor): beklemeye devam
      }
      if (Date.now() - installing.startedAt > MAC_WAIT_MS) setSlow(true);
      window.setTimeout(() => void poll(), 4000);
    };
    const t = window.setTimeout(() => void poll(), 6000);
    return () => {
      stop = true;
      window.clearTimeout(t);
    };
  }, [installing, info.channel]);

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
        (info.channel === "mac"
          ? "• Program birkaç dakika (yeni sürüm derlenirken 2–5 dk) kapanır, sonra kendiliğinden açılır. Bu sırada kasa ve telefon bağlantısı çalışmaz.\n" +
            "• Bir sorun olursa eski sürüme kendiliğinden geri dönülür.\n"
          : "• Program 1–2 dakika kapanır, sonra kendiliğinden açılır. Bu sırada kasa ve telefon bağlantısı çalışmaz.\n") +
        "• Satış yapılmıyorken güncelleyin.",
    );
    if (!ok) return;
    setBusy("download");
    setNotice(null);
    try {
      const r = await api<{ version: string; backup: string; update: UpdateInfo }>("/api/update/download", { body: {} });
      setInfo(r.update);
      if (r.update.channel === "mac") {
        await api("/api/update/install", { body: {} });
      } else {
        window.chrome?.webview?.postMessage("market-kasa:install-update");
      }
      setInstalling({ target: r.version, startedAt: Date.now() });
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "Güncelleme indirilemedi.") });
    } finally {
      setBusy(null);
    }
  }

  const latest = info.latest;
  // Mac'te kurulum sunucuda yapılır (hangi cihazdan basıldığı fark etmez); Windows'ta Market Kasa penceresi kurar
  const canInstall = info.canDownload && (info.channel === "mac" || inWindow);
  const last = info.lastInstall;
  return (
    <section id="guncelleme" className="scroll-mt-20 rounded-2xl bg-white p-4 shadow-sm" aria-label="Program güncellemesi">
      <h2 className="text-lg font-semibold">Program sürümü ve güncelleme</h2>
      <p className="mt-1 text-sm text-slate-600">
        Çalışan sürüm: <b data-testid="app-version">{info.current}</b>
        {info.channel === "dev" && " (geliştirme kopyası)"}
        {info.checkedAt && <> · Son denetim: {formatIstanbulDateTime(info.checkedAt)}</>}
      </p>
      {notice && (
        <div className="mt-2">
          <Notice kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        </div>
      )}

      {last && info.channel === "mac" && !installing && (
        <p className={`mt-2 text-sm ${last.ok ? "text-slate-600" : "font-medium text-red-800"}`} data-testid="update-last">
          {last.ok
            ? `Son güncelleme: ${last.version ?? ""} (${formatIstanbulDateTime(last.at)}) ✓`
            : `Son güncelleme denemesi yapılamadı (${formatIstanbulDateTime(last.at)}): ${last.error ?? "bilinmeyen hata"} Program eski sürümle çalışıyor.`}
        </p>
      )}
      {!info.enabled ? (
        <p className="mt-2 text-sm text-slate-600">
          Bu klasör bir geliştirme kopyası: program buraya yapılan değişikliklerle doğrudan güncellenir. GitHub&apos;dan indirilen Windows ve Mac
          kurulumlarında program yeni sürümü kendisi bulur.
        </p>
      ) : installing ? (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3 font-medium text-emerald-900" role="status" data-testid="update-installing">
          {info.channel === "mac"
            ? `Güncelleme kuruluyor (${installing.target}). Program birkaç dakika kapalı kalacak; yeni sürüm hazır olunca bu sayfa kendiliğinden yenilenecek.`
            : "Güncelleme kuruluyor. Pencere kapanacak; 1–2 dakika sonra Market Kasa yeni sürümüyle kendiliğinden açılacak."}
          {slow && " Hâlâ açılmadıysa masaüstündeki Market Kasa simgesine tıklayın."}
        </p>
      ) : (
        <>
          {info.available && latest ? (
            <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3" data-testid="update-available">
              <p className="font-semibold text-emerald-900">Yeni sürüm var: {latest.version}</p>
              {latest.notes && <p className="mt-1 whitespace-pre-line text-sm text-emerald-900">{latest.notes}</p>}
              {canInstall ? (
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
