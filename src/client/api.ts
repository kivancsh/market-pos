/** Tarayıcıdan API çağrısı. Hata yanıtları ApiError olarak fırlatılır (mesaj Türkçe). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  const hasBody = init.body !== undefined || init.form !== undefined;
  try {
    res = await fetch(path, {
      method: init.method ?? (hasBody ? "POST" : "GET"),
      // FormData'da Content-Type'ı tarayıcı (sınır bilgisiyle) kendisi koyar
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      cache: "no-store",
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK_ERROR", "Sunucuya ulaşılamadı. Bağlantıyı kontrol edip tekrar deneyin.");
  }
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string; details?: unknown } })
    | null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      // Oturum bitti: istemci durumunu tamamen sıfırlamak için tam sayfa yükleme (bilinçli).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? "Beklenmeyen bir hata oluştu.", err?.details);
  }
  return data as T;
}
