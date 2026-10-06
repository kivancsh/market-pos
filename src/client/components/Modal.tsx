"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Basit, tam ekran karartmalı pencere. */
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  labelledBy = "modal-title",
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  labelledBy?: string;
}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Esc, odak nerede olursa olsun pencereyi kapatır (odak pencere dışına kaçmış olabilir).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className={`max-h-[95dvh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={labelledBy} className="text-xl font-bold text-slate-900">
            {title}
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100"
              aria-label="Kapat"
            >
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
