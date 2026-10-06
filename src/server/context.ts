import type { DB } from "./db/types";

/** Servislerin ihtiyaç duyduğu bağlam. `now` enjekte edilebilir (test ve seed için). */
export interface Ctx {
  db: DB;
  now: () => Date;
}
