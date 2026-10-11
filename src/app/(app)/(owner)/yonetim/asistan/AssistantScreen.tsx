"use client";

import { useState } from "react";
import { api, ApiError } from "@/client/api";
import { Notice, type NoticeKind } from "@/client/components/Notice";
import type { AssistantPageData, MonthlyReportView } from "@/server/services/assistant";
import { AiConnect } from "./AiConnect";
import { ReportView } from "./ReportView";
import { TargetsPanel } from "./TargetsPanel";

/** Yönetici Paneli → Yapay zekâ asistanı. */
export function AssistantScreen({ initial }: { initial: AssistantPageData }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<null | "generate" | "ai" | "email">(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const report = data.report;
  const month = data.selectedMonth;
  const isCurrent = month === data.currentMonth;

  async function reload(m = month) {
    const d = await api<AssistantPageData>(`/api/assistant?month=${m}`);
    setData(d);
    window.history.replaceState(null, "", `/yonetim/asistan?ay=${m}`);
  }

  async function run(kind: "generate" | "ai" | "email") {
    setBusy(kind);
    setNotice(null);
    try {
      if (kind === "email") {
        const r = await api<{ recipients: string[] }>(`/api/assistant/reports/${month}/email`, { method: "POST", body: {} });
        setNotice({ kind: "success", text: `Rapor gönderildi: ${r.recipients.join(", ")}` });
        return;
      }
      const r =
        kind === "generate"
          ? await api<{ report: MonthlyReportView }>("/api/assistant/reports", { method: "POST", body: { month } })
          : await api<{ report: MonthlyReportView }>(`/api/assistant/reports/${month}/ai`, { method: "POST", body: {} });
      await reload();
      if (r.report.aiError) setNotice({ kind: "warn", text: `Rapor hazır, ancak yapay zekâ yorumu alınamadı: ${r.report.aiError}` });
      else setNotice({ kind: "success", text: r.report.ai ? "Rapor ve yapay zekâ yorumu hazır." : "Rapor hazır." });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "İşlem yapılamadı." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4 print:max-w-none print:p-0" data-testid="assistant-screen">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Yapay zekâ asistanı</h1>
          <p className="text-slate-600">Her ay sonunda işletmenizi kalem kalem analiz eder, gerçekçi hedef koyar ve ne yapmanız gerektiğini söyler.</p>
        </div>
        <label className="flex items-center gap-2 text-sm print:hidden">
          <span className="font-semibold text-slate-700">Ay</span>
          <select
            className="h-10 rounded-xl border border-slate-300 bg-white px-2 font-semibold"
            value={month}
            onChange={(e) => void reload(e.target.value).catch(() => setNotice({ kind: "error", text: "Yüklenemedi." }))}
            data-testid="assistant-month"
          >
            {data.months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
                {m.month === data.currentMonth ? " (bu ay)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <TargetsPanel current={data.current} onSaved={() => void reload()} />

      {!data.ai.configured && <AiConnect status={data.ai} onChange={() => void reload()} />}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("generate")}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white disabled:opacity-50"
          data-testid="assistant-generate"
        >
          {busy === "generate" ? "Hazırlanıyor…" : report ? (isCurrent ? "Ara raporu yenile" : "Raporu yeniden oluştur") : isCurrent ? "Bu ayın ara raporunu oluştur" : "Raporu oluştur"}
        </button>
        {report && data.ai.enabled && (!report.ai || report.aiError) && (
          <button type="button" disabled={busy !== null} onClick={() => void run("ai")} className="rounded-xl border-2 border-emerald-600 px-4 py-2 font-semibold text-emerald-800 disabled:opacity-50" data-testid="assistant-ai-retry">
            {busy === "ai" ? "Yapay zekâ yazıyor…" : "Yapay zekâ yorumunu al"}
          </button>
        )}
        {report && (
          <button type="button" disabled={busy !== null || !data.mailReady} onClick={() => void run("email")} className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold disabled:opacity-50" title={data.mailReady ? undefined : "E-posta gönderimi bağlı değil ya da yöneticinin e-postası yok"}>
            {busy === "email" ? "Gönderiliyor…" : "E-postayla gönder"}
          </button>
        )}
        {report && (
          <button type="button" onClick={() => window.print()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold">
            Yazdır
          </button>
        )}
        {data.ai.configured && (
          <span className="text-sm text-slate-500">
            Yapay zekâ: {data.ai.enabled ? "açık" : "kapalı"} · <AiConnect status={data.ai} onChange={() => void reload()} compact />
          </span>
        )}
      </div>

      {(busy === "generate" || busy === "ai" || data.generating) && (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900" role="status" data-testid="assistant-busy">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden />
          <span>
            {data.ai.enabled
              ? "Rakamlar hesaplandı; yapay zekâ işletmenizi inceleyip planı yazıyor. Bu 1–3 dakika sürebilir, sayfadan ayrılmayın."
              : "Rakamlar hesaplanıyor…"}
          </span>
        </div>
      )}

      {report ? (
        <ReportView report={report} onPlanChange={(plan) => setData((d) => (d.report ? { ...d, report: { ...d.report, plan } } : d))} />
      ) : (
        <section className="rounded-2xl bg-white p-6 text-center shadow-sm" data-testid="assistant-empty">
          <p className="text-lg font-semibold">Bu ay için henüz rapor yok.</p>
          <p className="mt-1 text-slate-600">
            {isCurrent
              ? "Ay bitince rapor kendiliğinden hazırlanır ve e-postanıza gelir. İsterseniz şimdi bir ara rapor oluşturabilirsiniz."
              : "“Raporu oluştur”a basın; birkaç saniyede hazırlanır."}
          </p>
        </section>
      )}
    </main>
  );
}
