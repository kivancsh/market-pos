import { z } from "zod";
import { AppError } from "../errors";

// Zod hata mesajları Türkçe.
z.config(z.locales.tr());

export { z };

/** Girdiyi şemaya göre doğrular; hatalıysa 400 VALIDATION_ERROR fırlatır. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new AppError("VALIDATION_ERROR", "Gönderilen bilgiler hatalı.", 400, {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}
