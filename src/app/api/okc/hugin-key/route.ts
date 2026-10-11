import { apiRoute } from "@/server/http/api";
import { getHuginApiKey, rotateHuginApiKey } from "@/server/services/okc";

/** Hugin'e bildirilecek bağlantı şifresi (yalnız yönetici görür). */
export const GET = apiRoute(["owner"], ({ ctx }) => ({ key: getHuginApiKey(ctx.db), path: "/hugin/v1" }));

/** Yeni şifre üretir; eskisi geçersiz olur. */
export const POST = apiRoute(["owner"], ({ ctx }) => ({ key: rotateHuginApiKey(ctx), path: "/hugin/v1" }));
