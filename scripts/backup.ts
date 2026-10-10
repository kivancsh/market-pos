/** npm run backup — veritabanının anlık yedeğini backups/ klasörüne alır. */
import path from "node:path";
import { openDatabase, resolveDbPath } from "../src/server/db/connection";
import { createBackup } from "../src/server/services/backup";

async function main() {
  const db = openDatabase(resolveDbPath());
  const file = await createBackup(db, new Date());
  db.close();
  const rel = path.relative(process.cwd(), file);
  console.log(`✅ Yedek alındı: ${rel.startsWith("..") ? file : rel}`);
}

main().catch((e) => {
  console.error("Yedek alınamadı:", e);
  process.exit(1);
});
