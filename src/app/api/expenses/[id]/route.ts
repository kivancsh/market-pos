import { apiRoute, parseId, readJson } from "@/server/http/api";
import { deleteExpense, updateExpense } from "@/server/services/expenses";

export const PATCH = apiRoute<{ id: string }>(["owner"], async ({ req, ctx, params }) => ({
  expense: updateExpense(ctx, parseId(params.id), await readJson(req)),
}));

/** Gider silinir (kaydı kaybolmaz, raporlara girmez; işlem geçmişine yazılır). */
export const DELETE = apiRoute<{ id: string }>(["owner"], ({ ctx, params }) => {
  deleteExpense(ctx, parseId(params.id));
  return { ok: true };
});
