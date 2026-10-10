/**
 * Kullanıcı hesapları için bilgisayardan (Terminal) yapılan işlemler.
 *
 *   npm run users -- reset-password                        → yönetici şifresini sıfırla (sorarak, şifre ekranda görünmez)
 *   npm run users -- create-owner <kullanıcıAdı> <şifre> [--email=adres] [ad] → yönetici ekle (ilk kurulum dahil)
 *   npm run users -- create-cashier <ad> <pin>               → kasiyer ekle (Kasiyer No'su yazılır)
 *   npm run users -- list                                    → hesapları listele
 *
 * Şifreyi unutan yönetici bu dosyayla (veya "Yönetici Şifresi Sıfırla" kısayoluyla) yeni şifre belirler.
 * Program açıkken de çalıştırılabilir; o kullanıcının açık oturumları kapanır.
 */
import readline from "node:readline";
import type { Ctx } from "../src/server/context";
import { openDatabase, resolveDbPath } from "../src/server/db/connection";
import { listUsers } from "../src/server/db/repositories/users";
import { AppError } from "../src/server/errors";
import { createFirstOwner, createUser, hasOwner, resetOwnerPassword } from "../src/server/services/users";

/** Girdi bir dosyadan/borudan geliyorsa (Terminal değilse) tüm satırlar tek okuyucudan alınır. */
let pipedLines: AsyncIterator<string> | null = null;

async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    pipedLines ??= readline.createInterface({ input: process.stdin })[Symbol.asyncIterator]();
    const r = await pipedLines.next();
    process.stdout.write("\n");
    return r.done ? "" : r.value.trim();
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Yazılanı ekranda göstermeden okur (şifre için). */
function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return ask(question);
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function resetPassword(ctx: Ctx) {
  const owners = listUsers(ctx.db).filter((u) => u.role === "owner");
  if (owners.length === 0) {
    console.log("Henüz yönetici hesabı yok. Programı açın; ilk açılışta yönetici hesabı oluşturma ekranı gelir.");
    return;
  }
  console.log("Yönetici hesapları:");
  for (const o of owners) console.log(`  • ${o.username}  (${o.name}${o.isActive ? "" : ", pasif"})`);
  console.log();
  let username = owners.length === 1 ? owners[0]!.username! : "";
  if (!username) username = await ask("Şifresi sıfırlanacak kullanıcı adı: ");
  else console.log(`Kullanıcı: ${username}`);
  const p1 = await askHidden("Yeni şifre (en az 8 karakter, yazarken görünmez): ");
  const p2 = await askHidden("Yeni şifre (tekrar): ");
  if (p1 !== p2) throw new AppError("MISMATCH", "Şifreler aynı değil. Tekrar deneyin.", 400);
  const u = resetOwnerPassword(ctx, username, p1);
  console.log(`\n✅ ${u.name} (${u.username}) için yeni şifre kaydedildi. Giriş ekranında "Yönetici" sekmesinden girebilirsiniz.`);
}

async function main() {
  const [cmd, ...rawArgs] = process.argv.slice(2);
  const emailArg = rawArgs.find((a) => a.startsWith("--email="))?.slice("--email=".length) || null;
  const args = rawArgs.filter((a) => !a.startsWith("--email="));
  const db = openDatabase(resolveDbPath());
  const ctx: Ctx = { db, now: () => new Date() };
  try {
    switch (cmd) {
      case "reset-password":
        await resetPassword(ctx);
        break;
      case "create-owner": {
        const [username = "", password = "", ...nameParts] = args;
        const name = nameParts.join(" ") || "Yönetici";
        if (hasOwner(ctx) && !emailArg) throw new AppError("EMAIL_REQUIRED", "Yeni yönetici için --email=adres gerekli.", 400);
        const u = hasOwner(ctx)
          ? createUser(ctx, { role: "owner", name, username, password, email: emailArg! })
          : createFirstOwner(ctx, { name, username, password, passwordConfirm: password, email: emailArg });
        console.log(`✅ Yönetici eklendi: ${u.name} (${u.username})${u.email ? `, ${u.email}` : ""}`);
        break;
      }
      case "create-cashier": {
        const [name = "", pin = ""] = args;
        const u = createUser(ctx, { role: "cashier", name, pin });
        console.log(`✅ Kasiyer eklendi: ${u.name} — Kasiyer No: ${u.cashierNo}`);
        break;
      }
      case "list":
        for (const u of listUsers(db)) {
          const ident = u.role === "owner" ? `${u.username}${u.email ? `, ${u.email}` : ""}` : `Kasiyer No ${u.cashierNo}`;
          console.log(`${u.id}\t${u.role === "owner" ? "yönetici" : "kasiyer"}\t${u.isActive ? "aktif" : "pasif"}\t${u.name} (${ident})`);
        }
        break;
      default:
        console.log("Kullanım: npm run users -- reset-password | create-owner <kullanıcıAdı> <şifre> [--email=adres] [ad] | create-cashier <ad> <pin> | list");
        process.exitCode = 1;
    }
  } catch (e) {
    if (e instanceof AppError) {
      const issues = (e.details as { issues?: { message: string }[] } | undefined)?.issues;
      console.error(`❌ ${issues?.map((i) => i.message).join(" ") || e.message}`);
      process.exitCode = 1;
    } else {
      throw e;
    }
  } finally {
    db.close();
  }
}

void main();
