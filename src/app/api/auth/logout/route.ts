import { apiRoute } from "@/server/http/api";

export const POST = apiRoute("public", ({ session }) => {
  session.destroy();
  return { ok: true };
});
