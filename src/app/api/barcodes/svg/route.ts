import { barcodeSvg } from "@/server/barcodeSvg";
import { badRequest } from "@/server/errors";
import { apiRoute } from "@/server/http/api";

const MAX_CODES = 300;

/** Etiket görselleri: ?code=A&code=B → { svgs: { A: "<svg…>", B: "<svg…>" } } */
export const GET = apiRoute(["owner"], ({ req }) => {
  const codes = [...new Set(new URL(req.url).searchParams.getAll("code"))].filter((c) => c && c.length <= 64);
  if (codes.length > MAX_CODES) throw badRequest("TOO_MANY", "Tek seferde en fazla 300 barkod.");
  const svgs: Record<string, string> = {};
  for (const c of codes) {
    try {
      svgs[c] = barcodeSvg(c);
    } catch {
      // çizilemeyen barkod atlanır; ekranda uyarı gösterilir
    }
  }
  return { svgs };
});
