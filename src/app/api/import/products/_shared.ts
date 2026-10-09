import { readImportFile, type RawImportRow } from "@/server/excel";
import { badRequest } from "@/server/errors";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** multipart/form-data içindeki "file" alanını okuyup satırlara çevirir. */
export async function readUploadedRows(req: Request): Promise<RawImportRow[]> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("NO_FILE", "Dosya gönderilemedi.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("NO_FILE", "Lütfen bir Excel (.xlsx) dosyası seçin.");
  if (file.size > MAX_FILE_BYTES) throw badRequest("FILE_TOO_LARGE", "Dosya en fazla 5 MB olabilir.");
  try {
    return await readImportFile(await file.arrayBuffer());
  } catch (e) {
    throw badRequest("BAD_FILE", (e as Error).message);
  }
}
