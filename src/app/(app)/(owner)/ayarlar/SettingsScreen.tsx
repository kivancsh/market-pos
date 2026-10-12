"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIstanbulDateTime } from "@/lib/businessDate";
import { formatKurusPlain, formatTRY, parseTRYToKurus } from "@/lib/money";
import { api, ApiError } from "@/client/api";
import { CodeEntry, type Challenge } from "@/client/components/CodeEntry";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import { beepError, beepSuccess } from "@/client/sound";
import type { Settings } from "@/server/db/repositories/settings";
import type { MailStatus } from "@/server/mail";
import type { UpdateInfo } from "@/server/update";
import { OkcSection } from "./OkcSection";
import { UpdateSection } from "./UpdateSection";
import { errText } from "@/client/errors";
import { MICROSOFT_UNSUPPORTED, isMicrosoftPersonal } from "@/lib/mailAddress";
import type { BackupInfo } from "@/server/services/backup";
import type { ImportPreview, ImportResult } from "@/server/services/productImport";

const field = "mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-base";

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5" />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function SettingsScreen({
  initial,
  initialMail,
  initialUpdate,
  mailService,
}: {
  initial: Settings;
  initialMail: MailStatus;
  initialUpdate: UpdateInfo;
  /** Merkezi Optiva e-posta servisi açık mı (açıksa e-posta bağlamak adres + kod kadar basit) */
  mailService: boolean;
}) {
  const [s, setS] = useState(initial);
  const [opening, setOpening] = useState(formatKurusPlain(initial.openingCashKurus));
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const num = (k: "scannerMaxIntervalMs" | "scannerMinLength" | "scannerDupWindowMs" | "labelCols" | "labelRows") => ({
    value: Number.isFinite(s[k]) ? String(s[k]) : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value)),
  });

  async function save() {
    const openingK = parseTRYToKurus(opening);
    if (openingK === null) return setNotice({ kind: "error", text: "Açılış kasasını 500 veya 500,00 gibi yazın." });
    setBusy(true);
    try {
      // Yazar kasa çalışma şekli kendi bölümünden anında kaydedilir; burada eski değeri geri yazmayalım
      const rest: Partial<Settings> = { ...s };
      delete rest.okcMode;
      const r = await api<Settings>("/api/settings", { method: "PATCH", body: { ...rest, openingCashKurus: openingK } });
      setS(r);
      setOpening(formatKurusPlain(r.openingCashKurus));
      setNotice({ kind: "success", text: "Ayarlar kaydedildi. Kasa ekranı açıksa yenileyin (F5) ki yeni ayarlar geçerli olsun." });
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { issues?: { path: string; message: string }[] } | undefined) : undefined;
      const extra = details?.issues?.map((i) => `${i.path}: ${i.message}`).join("; ");
      setNotice({ kind: "error", text: `${e instanceof ApiError ? e.message : "Kaydedilemedi."}${extra ? ` (${extra})` : ""}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-3 sm:p-4">
      <h1 className="text-2xl font-bold">Ayarlar</h1>
      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">İşletme ve kasa</h2>
          <label className="mt-2 block text-sm font-medium text-slate-700">
            İşletme adı (fişte ve ekranlarda görünür)
            <input value={s.businessName} onChange={(e) => set("businessName", e.target.value)} className={field} data-testid="set-business-name" />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Açılış kasası (her gün kasada bırakılan bozuk para)
            <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} className={field} />
          </label>
          <Toggle
            label="Kasiyer indirim yapabilsin"
            hint="Kapalıyken indirim alanı sadece yöneticiye görünür."
            checked={s.cashierCanDiscount}
            onChange={(v) => set("cashierCanDiscount", v)}
          />
          <Toggle
            label="Stokta olmayan ürün satılabilsin (eksi stok)"
            hint="Kapalıyken (önerilen) stok yetmezse satış reddedilir."
            checked={s.allowNegativeStock}
            onChange={(v) => set("allowNegativeStock", v)}
          />
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Barkod okuyucu ve ses</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className="text-sm font-medium text-slate-700">
              Tuş aralığı (ms)
              <input type="number" min={10} max={500} {...num("scannerMaxIntervalMs")} className={field} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              En az karakter
              <input type="number" min={3} max={30} {...num("scannerMinLength")} className={field} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Çift okuma (ms)
              <input type="number" min={0} max={1000} {...num("scannerDupWindowMs")} className={field} />
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Varsayılanlar: 50 ms · 6 karakter · 80 ms. Okuyucunuz yavaşsa (bazı Bluetooth modeller) aşağıdaki testle ölçüp tuş aralığını artırın.
          </p>
          <ScannerTester maxIntervalMs={s.scannerMaxIntervalMs} minLength={s.scannerMinLength} />
          <Toggle label="Bip sesi açık" checked={s.soundEnabled} onChange={(v) => set("soundEnabled", v)} />
          <div className="flex gap-2">
            <button type="button" onClick={() => beepSuccess()} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
              Başarı sesini dene
            </button>
            <button type="button" onClick={() => beepError()} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
              Hata sesini dene
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Etiket ızgarası (varsayılan)</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm font-medium text-slate-700">
              Sütun
              <input type="number" min={1} max={10} {...num("labelCols")} className={field} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Satır
              <input type="number" min={1} max={20} {...num("labelRows")} className={field} />
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">A4 etiket kağıdınızdaki etiket düzenine göre (ör. 3 × 8 = 24 etiket).</p>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Günlük rapor e-postası</h2>
          <Toggle
            label="Her gün rapor e-postası gönderilsin"
            hint="Günü Kapat'ta hemen gider. Gün kapatılmazsa aşağıdaki saatte gönderilir (o saatte bilgisayar kapalıysa ertesi açılışta)."
            checked={s.dailyReportEnabled}
            onChange={(v) => set("dailyReportEnabled", v)}
          />
          <label className="mt-1 block text-sm font-medium text-slate-700">
            Gün kapatılmazsa gönderim saati
            <input type="time" value={s.dailyReportTime} onChange={(e) => set("dailyReportTime", e.target.value)} className={`${field} w-40`} data-testid="set-report-time" />
          </label>
        </section>

        <div className="flex items-end lg:col-span-2">
          <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 text-lg font-bold text-white disabled:bg-slate-300 sm:w-auto sm:px-10" data-testid="save-settings">
            {busy ? "Kaydediliyor…" : "Ayarları kaydet"}
          </button>
        </div>
      </form>

      <OkcSection initialMode={initial.okcMode} />
      <MailSection initial={initialMail} serviceAvailable={mailService} />
      <ImportSection />
      <BackupSection />
      <UpdateSection initial={initialUpdate} />
    </main>
  );
}

/** Okuyucu testi: okutulan dizinin karakterleri arasındaki en uzun süreyi ölçer. */
function ScannerTester({ maxIntervalMs, minLength }: { maxIntervalMs: number; minLength: number }) {
  const times = useRef<number[]>([]);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ chars: number; maxGap: number } | null>(null);
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <label className="text-sm font-medium text-slate-700">
        Okuyucu testi: buraya tıklayıp bir barkod okutun
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const t = times.current;
              const gaps = t.slice(1).map((x, i) => x - t[i]!);
              setResult({ chars: t.length, maxGap: gaps.length ? Math.round(Math.max(...gaps)) : 0 });
              times.current = [];
              setValue("");
            } else if (e.key.length === 1) {
              times.current.push(performance.now());
            }
          }}
          className={field}
          placeholder="Barkod okutun"
          autoComplete="off"
        />
      </label>
      {result && (
        <p className="mt-2 text-sm" aria-live="polite">
          {result.chars} karakter, en uzun tuş aralığı <strong>{result.maxGap} ms</strong>.{" "}
          {result.chars >= minLength && result.maxGap <= maxIntervalMs ? (
            <span className="font-semibold text-emerald-700">Mevcut ayarla okuyucu olarak algılanır ✓</span>
          ) : (
            <span className="font-semibold text-red-700">
              Algılanmaz. {result.chars < minLength ? `En az ${minLength} karakter gerekli.` : `Tuş aralığını en az ${result.maxGap + 10} ms yapın.`}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function ImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(kind: "preview" | "commit") {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    try {
      if (kind === "preview") {
        setPreview(await api<ImportPreview>("/api/import/products/preview", { form }));
        setResult(null);
      } else {
        setResult(await api<ImportResult>("/api/import/products/commit", { form }));
        setPreview(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Excel'den ürün içe aktar">
      <h2 className="text-lg font-semibold">Ürünleri Excel&apos;den içe aktar</h2>
      <ol className="mt-1 list-decimal pl-5 text-sm text-slate-600">
        <li>
          <a href="/api/import/products/template" download className="font-semibold text-emerald-700 underline">
            Şablonu indirin
          </a>{" "}
          ve ürünleri doldurun (açıklamalar şablonun ikinci sayfasında).
        </li>
        <li>Dosyayı seçip &quot;Önizle&quot;ye basın; hatalı satırlar kırmızı görünür ve içe aktarılmaz.</li>
        <li>Kontrol edip onaylayın. Barkodu boş olanlara dükkân içi barkod üretilir.</li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setResult(null);
            setError(null);
          }}
          className="text-sm"
          data-testid="import-file"
        />
        <button type="button" onClick={() => void send("preview")} disabled={!file || busy} className="h-11 rounded-xl bg-slate-900 px-4 font-semibold text-white disabled:bg-slate-300">
          {busy && !preview ? "Okunuyor…" : "Önizle"}
        </button>
      </div>
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {result && (
        <div className="mt-3">
          <Notice kind="success">
            {result.created.length} ürün eklendi{result.skipped > 0 && `, ${result.skipped} hatalı satır atlandı`}. Ürünler sayfasından kontrol edebilir, Etiketler&apos;den barkod basabilirsiniz.
          </Notice>
        </div>
      )}
      {preview && (
        <div className="mt-3 space-y-2">
          <p className="font-medium">
            {preview.rows.length} satır: <span className="text-emerald-700">{preview.validCount} içe aktarılacak</span>
            {preview.errorCount > 0 && <span className="text-red-700"> · {preview.errorCount} hatalı (atlanacak)</span>}
          </p>
          <div className="max-h-[50dvh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm" data-testid="import-preview">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-2 py-1">Satır</th>
                  <th className="px-2 py-1">Barkod</th>
                  <th className="px-2 py-1">Ürün</th>
                  <th className="px-2 py-1">Kategori</th>
                  <th className="px-2 py-1 text-right">Alış</th>
                  <th className="px-2 py-1 text-right">Satış</th>
                  <th className="px-2 py-1 text-right">KDV</th>
                  <th className="px-2 py-1 text-right">Stok</th>
                  <th className="px-2 py-1">Durum</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} className={`border-t border-slate-100 ${r.errors.length ? "bg-red-50 text-red-900" : ""}`}>
                    <td className="px-2 py-1">{r.rowNumber}</td>
                    <td className="px-2 py-1 font-mono">{r.barcode ?? "—"}</td>
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="px-2 py-1">{r.categoryName ?? ""}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.costKurus === null ? "?" : formatTRY(r.costKurus)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.priceKurus === null ? "?" : formatTRY(r.priceKurus)}</td>
                    <td className="px-2 py-1 text-right">{r.vatRate === null ? "?" : `%${r.vatRate}`}</td>
                    <td className="px-2 py-1 text-right">{r.stock ?? "?"}</td>
                    <td className="px-2 py-1">
                      {r.errors.length > 0 ? (
                        <span className="font-semibold">✗ {r.errors.join(" ")}</span>
                      ) : (
                        <span className="text-emerald-700">✓{r.warnings.length > 0 && <span className="text-amber-700"> {r.warnings.join(" ")}</span>}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => void send("commit")}
            disabled={busy || preview.validCount === 0}
            className="h-12 rounded-xl bg-emerald-600 px-6 font-bold text-white disabled:bg-slate-300"
            data-testid="import-commit"
          >
            {busy ? "İçe aktarılıyor…" : `${preview.validCount} ürünü içe aktar`}
          </button>
        </div>
      )}
    </section>
  );
}

function BackupSection() {
  const [items, setItems] = useState<BackupInfo[] | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: BackupInfo[] }>("/api/backups")).items);
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Yedekler listelenemedi." });
    }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function backupNow() {
    setBusy(true);
    try {
      const r = await api<{ file: string }>("/api/backups", { method: "POST" });
      setNotice({ kind: "success", text: `Yedek alındı: ${r.file}` });
      await load();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Yedek alınamadı." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Yedekler">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">Yedekler</h2>
        <button type="button" onClick={() => void backupNow()} disabled={busy} className="h-11 rounded-xl bg-slate-900 px-4 font-semibold text-white disabled:bg-slate-300" data-testid="backup-now">
          {busy ? "Yedekleniyor…" : "Şimdi yedek al"}
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Yedekler bilgisayarda projenin <code>backups</code> klasöründedir. Gün kapatılınca otomatik yedek alınır. Düzenli olarak bir USB belleğe veya buluta da kopyalayın.
      </p>
      {notice && (
        <div className="mt-2">
          <Notice kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        </div>
      )}
      {items === null ? (
        <p className="py-4 text-slate-500">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-slate-500">Henüz yedek yok.</p>
      ) : (
        <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm" data-testid="backup-list">
          {items.map((b) => (
            <li key={b.name} className="flex justify-between gap-2 py-2">
              <span className="font-mono">{b.name}</span>
              <span className="text-slate-500">
                {formatIstanbulDateTime(b.modifiedAt)} · {(b.sizeBytes / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} KB
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PROVIDERS = [
  { key: "gmail", label: "Gmail (önerilen)" },
  { key: "icloud", label: "iCloud" },
  { key: "yandex", label: "Yandex" },
  { key: "custom", label: "Diğer (SMTP)" },
] as const;

/** E-posta gönderim hesabı: durum, değiştir, deneme e-postası, raporu şimdi gönder. */
function MailSection({ initial, serviceAvailable }: { initial: MailStatus; serviceAvailable: boolean }) {
  const [status, setStatus] = useState(initial);
  const [editing, setEditing] = useState(false);
  // Merkezi servisle bağlama: adres → kod → bağla. "advanced" = kendi Gmail/SMTP hesabıyla
  const [advanced, setAdvanced] = useState(false);
  const [svcEmail, setSvcEmail] = useState("");
  const [svcChallenge, setSvcChallenge] = useState<Challenge | null>(null);
  const [svcCode, setSvcCode] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["key"]>((initial.provider as "gmail") ?? "gmail");
  const [user, setUser] = useState(initial.user ?? "");
  const [pass, setPass] = useState("");
  const [host, setHost] = useState(initial.provider === "custom" ? (initial.host ?? "") : "");
  const [port, setPort] = useState(String(initial.port ?? 465));
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ kind: "success", text: await fn() });
    } catch (e) {
      setNotice({ kind: "error", text: errText(e, "İşlem yapılamadı.") });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      const body: Record<string, unknown> = { provider, user, pass };
      if (provider === "custom") {
        body.host = host;
        body.port = Number(port);
      }
      const r = await api<{ mail: MailStatus }>("/api/settings/mail", { method: "PUT", body });
      setStatus(r.mail);
      setEditing(false);
      setPass("");
      router.refresh(); // üstteki "e-posta ayarlanmamış" şeridi kalksın
      return `Bağlandı: e-postalar ${r.mail.user} hesabından gönderilecek.`;
    });
  const svcStart = () =>
    run(async () => {
      const ch = await api<Challenge>("/api/settings/mail/service/start", { body: { email: svcEmail } });
      setSvcChallenge(ch);
      setSvcCode("");
      return `Kod gönderildi: ${ch.emailMasked}. Gelen kutunuza (ve Gereksiz klasörüne) bakın.`;
    });
  const svcConfirm = () =>
    run(async () => {
      const r = await api<{ mail: MailStatus }>("/api/settings/mail/service/confirm", { body: { email: svcEmail, code: svcCode } });
      setStatus(r.mail);
      setEditing(false);
      setSvcChallenge(null);
      router.refresh();
      return `Bağlandı. Gün sonu raporu ve onay kodları ${svcEmail} adresine gelecek.`;
    });
  const test = () => run(async () => `Deneme e-postası gönderildi: ${(await api<{ to: string }>("/api/settings/mail/test", { body: {} })).to}`);
  const sendReport = () =>
    run(async () => `Bugünün raporu gönderildi: ${(await api<{ recipients: string[] }>("/api/reports/daily-email", { body: {} })).recipients.join(", ")}`);

  return (
    <section id="eposta" className="scroll-mt-20 rounded-2xl bg-white p-4 shadow-sm" aria-label="E-posta">
      <h2 className="text-lg font-semibold">E-posta gönderimi (isteğe bağlı)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Bağlarsanız: şifrenizi unutunca e-postayla yenileyebilir, her akşam günlük raporu e-postayla alırsınız; şifre değişiklikleri e-posta koduyla yapılır.
        {status.provider === "service" || (serviceAvailable && !status.configured)
          ? " Sadece e-posta adresinizi yazmanız yeter; e-postalar “Optiva” adına gönderilir."
          : " E-postalar bu hesaptan gönderilir; alıcı, yöneticilerin Hesabım'daki e-posta adresleridir."}
      </p>
      {notice && (
        <div className="mt-2">
          <Notice kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        </div>
      )}
      {editing && serviceAvailable && !advanced ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (svcChallenge ? svcConfirm() : svcStart());
          }}
          className="mt-3 flex flex-col gap-3"
          data-testid="mail-service-form"
        >
          {!svcChallenge ? (
            <label className="text-sm font-medium text-slate-700">
              E-posta adresiniz (gün sonu raporu buraya gelecek)
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  type="email"
                  autoCapitalize="none"
                  autoFocus
                  value={svcEmail}
                  onChange={(e) => setSvcEmail(e.target.value)}
                  className={`${field} mt-0 min-w-[16rem] flex-1`}
                  placeholder="ornek@gmail.com, …@hotmail.com — hepsi olur"
                  data-testid="mail-service-email"
                />
                <button type="submit" disabled={busy || !svcEmail} className="h-11 rounded-xl bg-slate-900 px-5 font-bold text-white disabled:bg-slate-300" data-testid="mail-service-send">
                  {busy ? "Gönderiliyor…" : "Kod gönder"}
                </button>
              </div>
            </label>
          ) : (
            <>
              <CodeEntry challenge={svcChallenge} code={svcCode} onCode={setSvcCode} onResend={() => void svcStart()} busy={busy} />
              <button type="submit" disabled={busy || svcCode.length !== 6} className="h-11 rounded-xl bg-emerald-600 px-5 font-bold text-white disabled:bg-slate-300" data-testid="mail-service-confirm">
                {busy ? "Bağlanılıyor…" : "Bağla"}
              </button>
            </>
          )}
          <div className="flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={() => { setEditing(false); setSvcChallenge(null); }} className="text-slate-600 underline">
              Vazgeç
            </button>
            <button type="button" onClick={() => setAdvanced(true)} className="text-slate-600 underline">
              Kendi Gmail hesabımla göndereyim (gelişmiş)
            </button>
          </div>
        </form>
      ) : !editing && !status.configured ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex-1 text-sm text-slate-600" data-testid="mail-status">
            Bağlı değil. Program e-postasız da tam çalışır.
          </span>
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" data-testid="mail-connect">
            E-posta bağla
          </button>
        </div>
      ) : !editing && status.configured ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex-1 font-medium" data-testid="mail-status">
            ✓ Bağlı: {status.provider === "service" ? `Optiva e-posta servisi → ${status.user}` : status.user}
          </span>
          <button type="button" disabled={busy} onClick={() => void test()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
            Deneme e-postası gönder
          </button>
          <button type="button" disabled={busy} onClick={() => void sendReport()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" data-testid="send-report-now">
            Bugünün raporunu şimdi gönder
          </button>
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
            Hesabı değiştir
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          <label className="text-sm font-medium text-slate-700">
            E-posta hizmeti
            <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} className={field}>
              {PROVIDERS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            E-posta adresi
            <input type="email" autoCapitalize="none" value={user} onChange={(e) => setUser(e.target.value)} className={field} />
            {isMicrosoftPersonal(user) && (
              <span className="mt-1 block rounded-lg bg-amber-50 px-2 py-1 text-sm font-medium text-amber-900" data-testid="mail-microsoft-hint">
                {MICROSOFT_UNSUPPORTED}
              </span>
            )}
          </label>
          <label className="text-sm font-medium text-slate-700">
            {provider === "gmail" ? "Uygulama şifresi (16 harf)" : "Şifre / uygulama şifresi"}
            <input type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} className={field} />
          </label>
          {provider === "custom" && (
            <div className="flex gap-2">
              <label className="flex-1 text-sm font-medium text-slate-700">
                SMTP sunucusu
                <input autoCapitalize="none" value={host} onChange={(e) => setHost(e.target.value)} className={field} />
              </label>
              <label className="w-24 text-sm font-medium text-slate-700">
                Port
                <input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className={field} />
              </label>
            </div>
          )}
          {provider === "gmail" && (
            <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900 sm:col-span-2" data-testid="gmail-help">
              <b>Gmail uygulama şifresi nasıl alınır?</b>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Telefonda ya da bilgisayarda Google hesabınıza girin: <b>myaccount.google.com</b></li>
                <li><b>Güvenlik</b> → <b>2 Adımlı Doğrulama</b>&apos;yı açın (kapalıysa).</li>
                <li>Arama kutusuna <b>Uygulama şifreleri</b> yazın, açın.</li>
                <li>Ad olarak <b>Optiva</b> yazıp <b>Oluştur</b>&apos;a basın.</li>
                <li>Çıkan 16 harfli şifreyi yukarıdaki kutuya yazın (boşluklar önemli değil).</li>
              </ol>
              <p className="mt-1">Normal Gmail şifreniz burada çalışmaz.</p>
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-xl border border-slate-300 px-5 font-semibold">
              Vazgeç
            </button>
            <button type="submit" disabled={busy || !user || !pass} className="h-11 rounded-xl bg-slate-900 px-5 font-bold text-white disabled:bg-slate-300">
              {busy ? "Bağlanılıyor…" : "Bağlan ve kaydet"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
