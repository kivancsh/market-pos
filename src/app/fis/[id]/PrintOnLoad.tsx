"use client";

import { useEffect } from "react";

export function PrintOnLoad({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) window.print();
  }, [enabled]);
  return (
    <button type="button" onClick={() => window.print()} className="no-print mt-4 w-full rounded border border-black py-2 font-sans">
      Yazdır
    </button>
  );
}
