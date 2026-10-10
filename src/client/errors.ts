import { ApiError } from "./api";

/** API hatasını ekranda gösterilecek Türkçe metne çevirir (alan hatalarıyla birlikte). */
export function errText(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  const d = e.details as { issues?: { message: string }[] } | undefined;
  return d?.issues?.map((i) => i.message).join(" ") || e.message;
}
