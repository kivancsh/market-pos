import type { DB } from "./db/types";
import type { Role } from "./db/repositories/sales";

/** İşlemi yapan kullanıcı (işlem geçmişi ve satışın kimin yaptığı için). */
export interface ActorInfo {
  userId: number | null;
  name: string;
  role: Role;
}

/** Servislerin ihtiyaç duyduğu bağlam. `now` enjekte edilebilir (test ve seed için). */
export interface Ctx {
  db: DB;
  now: () => Date;
  actor?: ActorInfo;
}
