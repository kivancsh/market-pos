"use client";

export type NoticeKind = "success" | "error" | "warn" | "info";

const STYLES: Record<NoticeKind, string> = {
  success: "bg-emerald-100 text-emerald-900 border-emerald-300",
  error: "bg-red-100 text-red-900 border-red-400",
  warn: "bg-amber-100 text-amber-900 border-amber-300",
  info: "bg-sky-100 text-sky-900 border-sky-300",
};

/** Kısa durum mesajı kutusu. */
export function Notice({ kind, children, onClose }: { kind: NoticeKind; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 font-medium ${STYLES[kind]}`}
    >
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="text-xl leading-none opacity-70 hover:opacity-100" aria-label="Kapat">
          ×
        </button>
      )}
    </div>
  );
}
