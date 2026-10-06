/**
 * Uygulama hataları. `message` her zaman kullanıcıya gösterilebilir Türkçe metindir.
 * API katmanı bunları { error: { code, message, details? } } biçimine çevirir.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, 400, details);
export const forbidden = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, 403, details);
export const notFound = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, 404, details);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, 409, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, 422, details);
