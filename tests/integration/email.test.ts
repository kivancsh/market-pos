import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import * as emailStartRoute from "@/app/api/account/email/start/route";
import * as emailVerifyRoute from "@/app/api/account/email/verify/route";
import * as loginRoute from "@/app/api/auth/login/route";
import * as forgotStartRoute from "@/app/api/auth/forgot/start/route";
import * as forgotVerifyRoute from "@/app/api/auth/forgot/verify/route";
import * as closeRoute from "@/app/api/day-closings/route";
import * as dailyEmailRoute from "@/app/api/reports/daily-email/route";
import * as catalogRoute from "@/app/api/catalog/route";
import * as secretStartRoute from "@/app/api/users/[id]/secret/start/route";
import * as secretVerifyRoute from "@/app/api/users/[id]/secret/verify/route";
import * as secretDirectRoute from "@/app/api/users/[id]/secret/route";
import { resetLimiterForTests } from "@/server/auth/loginLimiter";
import { readMailConfig } from "@/server/db/repositories/mailConfig";
import { getUserById } from "@/server/db/repositories/users";
import { setTestCtxFactory } from "@/server/http/api";
import { decryptSecret, encryptSecret, friendlyMailError, maskEmail, saveMailSettings, setTestMailSender } from "@/server/mail";
import { MICROSOFT_UNSUPPORTED, isMicrosoftPersonal } from "@/lib/mailAddress";
import { completeSale } from "@/server/services/sales";
import { dueReportDates, runScheduledReports } from "@/server/services/dailyReport";
import { updateSettings } from "@/server/services/settings";
import { authenticateCashier, authenticateOwner, createUser, updateUser } from "@/server/services/users";
import { TEST_CASHIER, TEST_OWNER, captureMail, cookieForUser, ensureUsers } from "../apiHelpers";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;
let mail: ReturnType<typeof captureMail>;

beforeEach(() => {
  env = createEnv("2026-10-06T09:00:00.000Z"); // İstanbul 12:00
  p = seedSample(env);
  setTestCtxFactory(() => env.ctx);
  resetLimiterForTests();
  mail = captureMail();
});
afterEach(() => {
  mail.stop();
  expectIntegrity(env);
});
afterAll(() => setTestCtxFactory(undefined));

function req(path: string, opts: { body?: unknown; cookie?: string } = {}): Request {
  const headers = new Headers({ host: "localhost:3000" });
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${path}`, {
    method: opts.body !== undefined ? "POST" : "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const params = <T>(v: T) => ({ params: Promise.resolve(v) });
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const later = (sec: number) => env.setNow(new Date(env.ctx.now().getTime() + sec * 1000).toISOString());

describe("şifremi unuttum (giriş ekranı)", () => {
  beforeEach(() => ensureUsers(env));

  it("kod yöneticinin e-postasına gider; doğru kod + yeni şifreyle şifre değişir", async () => {
    const st = await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "YONETICI" } }));
    expect(st.status).toBe(200);
    const ch = await json(st);
    expect(ch.emailMasked).toBe(maskEmail(TEST_OWNER.email));
    expect(mail.sent[0]!.to).toBe(TEST_OWNER.email);
    expect(mail.sent[0]!.subject).toMatch(/^Optiva onay kodu: \d{6}$/);

    // kısa şifre: kod HARCANMADAN reddedilir
    const short = await forgotVerifyRoute.POST(req("/api/auth/forgot/verify", { body: { token: ch.token, code: mail.lastCode(), newPassword: "kisa", newPasswordConfirm: "kisa" } }));
    expect(short.status).toBe(400);
    const ok = await forgotVerifyRoute.POST(
      req("/api/auth/forgot/verify", { body: { token: ch.token, code: mail.lastCode(), newPassword: "yepyeni-sifre-1", newPasswordConfirm: "yepyeni-sifre-1" } }),
    );
    expect(ok.status).toBe(200);
    expect(authenticateOwner(env.ctx, TEST_OWNER.username, TEST_OWNER.password)).toBeNull();
    expect(authenticateOwner(env.ctx, TEST_OWNER.username, "yepyeni-sifre-1")).not.toBeNull();
    const audit = env.db.prepare("SELECT summary FROM audit_log ORDER BY id DESC LIMIT 1").get() as { summary: string };
    expect(audit.summary).toContain("şifre sıfırlandı (e-posta onaylı)");
  });

  it("bilinmeyen kullanıcı ve e-postası olmayan yönetici için açık mesaj; 60 sn içinde ikinci kod istenemez", async () => {
    expect((await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yok" } }))).status).toBe(404);
    env.db.prepare("UPDATE users SET email = NULL WHERE role = 'owner'").run();
    const noMail = await json(await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } })));
    expect(noMail.error.message).toContain("Yönetici Şifresi Sıfırla");
    env.db.prepare("UPDATE users SET email = ? WHERE role = 'owner'").run(TEST_OWNER.email);

    expect((await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } }))).status).toBe(200);
    const tooSoon = await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } }));
    expect(tooSoon.status).toBe(429);
    later(61);
    expect((await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } }))).status).toBe(200);
    expect(mail.sent).toHaveLength(2);
  });

  it("5 hatalı denemeden sonra kod kilitlenir; 10 dakika sonra süresi dolar; yeni kod eskisini geçersiz kılar", async () => {
    const body = (token: string, code: string) => ({ body: { token, code, newPassword: "yepyeni-sifre-1", newPasswordConfirm: "yepyeni-sifre-1" } });
    const a = await json(await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } })));
    const codeA = mail.lastCode();
    const wrong = codeA === "111111" ? "222222" : "111111";
    for (let i = 4; i >= 1; i--) {
      const r = await json(await forgotVerifyRoute.POST(req("/api/auth/forgot/verify", body(a.token, wrong))));
      expect(r.error.message).toBe(`Kod hatalı. Kalan deneme: ${i}`);
    }
    await forgotVerifyRoute.POST(req("/api/auth/forgot/verify", body(a.token, wrong)));
    const locked = await json(await forgotVerifyRoute.POST(req("/api/auth/forgot/verify", body(a.token, codeA))));
    expect(locked.error.code).toBe("CODE_LOCKED");

    later(61);
    const b = await json(await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } })));
    const codeB = mail.lastCode();
    later(601);
    expect((await json(await forgotVerifyRoute.POST(req("/api/auth/forgot/verify", body(b.token, codeB))))).error.code).toBe("CODE_EXPIRED");

    const c = await json(await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } })));
    const codeC = mail.lastCode();
    later(61);
    await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } })); // yeni kod → C geçersiz
    expect((await json(await forgotVerifyRoute.POST(req("/api/auth/forgot/verify", body(c.token, codeC))))).error.code).toBe("CODE_INVALID");
    expect(authenticateOwner(env.ctx, TEST_OWNER.username, TEST_OWNER.password)).not.toBeNull();
  });
});

describe("şifre / PIN değiştirme yetkisi yöneticide (e-posta onaylı)", () => {
  async function change(ownerCookie: string, targetId: number, secret: string, extra: Record<string, unknown> = {}) {
    const st = await secretStartRoute.POST(req(`/api/users/${targetId}/secret/start`, { body: {}, cookie: ownerCookie }), params({ id: String(targetId) }));
    if (st.status !== 200) return st;
    const { token } = await json(st);
    return secretVerifyRoute.POST(
      req(`/api/users/${targetId}/secret/verify`, { body: { token, code: mail.lastCode(), secret, secretConfirm: secret, ...extra }, cookie: ownerCookie }),
      params({ id: String(targetId) }),
    );
  }

  it("kasiyerin PIN'i: kod yöneticinin e-postasına gider; eski oturum düşer; yeni PIN'le No + PIN girişi", async () => {
    const { owner, cashier } = ensureUsers(env);
    const ownerCookie = await cookieForUser(owner);
    const oldCashierCookie = await cookieForUser(cashier);
    const r = await change(ownerCookie, cashier.id, "4321");
    expect(r.status).toBe(200);
    expect(mail.sent[0]!.to).toBe(TEST_OWNER.email);
    expect(mail.sent[0]!.text).toContain(`${TEST_CASHIER.name} (Kasiyer No 1001) için yeni PIN belirleme`);
    expect((await catalogRoute.GET(req("/api/catalog", { cookie: oldCashierCookie }))).status).toBe(401);
    const login = await loginRoute.POST(req("/api/auth/login", { body: { mode: "cashier", cashierNo: "1001", pin: "4321" } }));
    expect(login.status).toBe(200);
  });

  it("pasif kasiyer yeni PIN'le tekrar aktif edilir; aynı PIN başka kasiyerde varsa reddedilir (kod harcanmaz)", async () => {
    const { owner, cashier } = ensureUsers(env);
    const ownerCtx = { ...env.ctx, actor: { userId: owner.id, name: owner.name, role: "owner" as const } };
    createUser(ownerCtx, { role: "cashier", name: "Zeynep", pin: "2468" });
    updateUser(ownerCtx, cashier.id, { isActive: false });
    const ownerCookie = await cookieForUser(owner);
    const taken = await change(ownerCookie, cashier.id, "2468", { activate: true });
    expect((await json(taken)).error.code).toBe("PIN_TAKEN");
    later(61);
    const ok = await change(ownerCookie, cashier.id, "9753", { activate: true });
    expect((await json(ok)).user).toMatchObject({ isActive: true });
  });

  it("yönetici kendi şifresini de kodla değiştirir; e-postası yoksa önce e-posta eklemesi istenir", async () => {
    const { owner } = ensureUsers(env);
    const ownerCookie = await cookieForUser(owner);
    const r = await change(ownerCookie, owner.id, "kendi-yeni-sifre");
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBeTruthy(); // bu cihazdaki oturum yeni şifreyle sürer
    expect(authenticateOwner(env.ctx, TEST_OWNER.username, "kendi-yeni-sifre")).not.toBeNull();

    env.db.prepare("UPDATE users SET email = NULL WHERE id = ?").run(owner.id);
    const fresh = await cookieForUser({ ...owner, sessionVersion: owner.sessionVersion + 1 });
    const noEmail = await json(await secretStartRoute.POST(req(`/api/users/${owner.id}/secret/start`, { body: {}, cookie: fresh }), params({ id: String(owner.id) })));
    expect(noEmail.error.code).toBe("EMAIL_REQUIRED");
  });

  it("bir işlemin kodu başka bir kullanıcının değişikliğinde kullanılamaz", async () => {
    const { owner, cashier } = ensureUsers(env);
    const ownerCookie = await cookieForUser(owner);
    const st = await json(await secretStartRoute.POST(req(`/api/users/${cashier.id}/secret/start`, { body: {}, cookie: ownerCookie }), params({ id: String(cashier.id) })));
    const r = await secretVerifyRoute.POST(
      req(`/api/users/${owner.id}/secret/verify`, { body: { token: st.token, code: mail.lastCode(), secret: "baska-sifre-77", secretConfirm: "baska-sifre-77" }, cookie: ownerCookie }),
      params({ id: String(owner.id) }),
    );
    expect(r.status).toBe(400);
    expect(authenticateOwner(env.ctx, TEST_OWNER.username, TEST_OWNER.password)).not.toBeNull();
  });
});

describe("e-posta adresi değiştirme", () => {
  it("kod YENİ adrese gider; doğru kodla adres değişir", async () => {
    const { owner } = ensureUsers(env);
    const cookie = await cookieForUser(owner);
    const st = await json(await emailStartRoute.POST(req("/api/account/email/start", { body: { email: "Yeni.Adres@Ornek.com" }, cookie })));
    expect(mail.sent[0]!.to).toBe("yeni.adres@ornek.com");
    const r = await emailVerifyRoute.POST(req("/api/account/email/verify", { body: { token: st.token, code: mail.lastCode() }, cookie }));
    expect((await json(r)).user.email).toBe("yeni.adres@ornek.com");
  });
});

describe("e-posta gönderim ayarları", () => {
  it("uygulama şifresi şifrelenmiş saklanır ve geri çözülür; Gmail şifresindeki boşluklar atılır", async () => {
    await saveMailSettings(env.db, { provider: "gmail", user: "dukkan@gmail.com", pass: "abcd efgh ijkl mnop" });
    const row = readMailConfig(env.db)!;
    expect(row).toMatchObject({ host: "smtp.gmail.com", port: 465, user: "dukkan@gmail.com" });
    expect(row.passEnc).not.toContain("abcd");
    expect(decryptSecret(row.passEnc)).toBe("abcdefghijklmnop");
    const parts = encryptSecret("gizli").split(".");
    parts[3] = Buffer.from("kurcalanmis").toString("base64");
    expect(decryptSecret(parts.join("."))).toBeNull(); // değiştirilmiş veri çözülmez
  });

  it("gönderim ayarlı değilse şifremi unuttum kasa bilgisayarındaki aracı tarif eder", async () => {
    ensureUsers(env);
    setTestMailSender(null);
    const r = await json(await forgotStartRoute.POST(req("/api/auth/forgot/start", { body: { username: "yonetici" } })));
    expect(r.error.code).toBe("EMAIL_REQUIRED");
    expect(r.error.message).toContain("Yönetici Şifresi Sıfırla");
    expect(env.db.prepare("SELECT COUNT(*) AS n FROM verification_codes").get()).toEqual({ n: 0 });
  });
});

describe("günlük rapor e-postası", () => {
  function sell() {
    const { cashier } = ensureUsers(env);
    const c = { ...env.ctx, actor: { userId: cashier.id, name: cashier.name, role: "cashier" as const } };
    completeSale(c, { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 2 }], paymentMethod: "cash" }, { role: "cashier" });
  }

  it("Günü Kapat'ta yöneticilere gider: özet + kasa sayımı + Excel eki; kayıt tutulur", async () => {
    const { owner } = ensureUsers(env);
    sell();
    const r = await json(await closeRoute.POST(req("/api/day-closings", { body: { countedCashKurus: 10000 }, cookie: await cookieForUser(owner) })));
    expect(r.report).toEqual({ status: "sent", recipients: [TEST_OWNER.email] });
    const m = mail.sent.at(-1)!;
    expect(m.subject).toContain("günlük rapor 06.10.2026");
    expect(m.subject).toContain("ciro ₺100,00");
    expect(m.html).toContain("Kasa tam");
    expect(m.html).toContain("Kola 1 L — 2 adet");
    expect(m.attachments?.[0]?.filename).toMatch(/^urun-karliligi-.*-2026-10-06\.xlsx$/);
    expect(m.attachments?.[0]?.content.subarray(0, 2).toString()).toBe("PK"); // geçerli xlsx (zip)
    expect(env.db.prepare("SELECT trigger, business_date AS d FROM daily_report_log").all()).toEqual([{ trigger: "close", d: "2026-10-06" }]);
    // aynı gün otomatik gönderim tekrar etmez
    env.setNow("2026-10-06T20:45:00.000Z"); // 23:45
    const sentBefore = mail.sent.length;
    expect((await runScheduledReports(env.ctx)).some((x) => x.status === "sent")).toBe(false);
    expect(mail.sent.length).toBe(sentBefore);
  });

  it("gün kapatılmazsa ayarlanan saatte bir kez gider; saatten önce ve satış yoksa gitmez; kapalı ayar göndermez", async () => {
    ensureUsers(env);
    expect(dueReportDates(new Date("2026-10-06T20:00:00.000Z"), "23:30")).toEqual(["2026-10-05"]); // 23:00
    expect(dueReportDates(new Date("2026-10-06T20:31:00.000Z"), "23:30")).toEqual(["2026-10-05", "2026-10-06"]);

    env.setNow("2026-10-06T20:31:00.000Z");
    expect((await runScheduledReports(env.ctx)).map((r) => r.status)).toEqual(["skipped", "skipped"]); // satış yok
    sell();
    expect((await runScheduledReports(env.ctx)).at(-1)).toMatchObject({ status: "sent" });
    expect(await runScheduledReports(env.ctx)).toHaveLength(1); // bugün gönderildi; sadece dün kontrol edilir
    expect(mail.sent).toHaveLength(1);

    updateSettings({ ...env.ctx, actor: undefined }, { dailyReportEnabled: false });
    env.setNow("2026-10-07T20:31:00.000Z");
    expect(await runScheduledReports(env.ctx)).toEqual([]);
  });

  it("bilgisayar o saatte kapalıysa ertesi açılışta önceki günün raporu gider", async () => {
    ensureUsers(env);
    sell(); // 6 Ekim
    env.setNow("2026-10-07T06:00:00.000Z"); // 7 Ekim 09:00
    const r = await runScheduledReports(env.ctx);
    expect(r).toEqual([{ status: "sent", recipients: [TEST_OWNER.email] }]);
    expect(mail.sent[0]!.subject).toContain("06.10.2026");
  });

  it("'Raporu şimdi gönder' (elle)", async () => {
    const { owner } = ensureUsers(env);
    sell();
    const r = await dailyEmailRoute.POST(req("/api/reports/daily-email", { body: {}, cookie: await cookieForUser(owner) }));
    expect(await json(r)).toMatchObject({ ok: true, recipients: [TEST_OWNER.email], date: "2026-10-06" });
  });
});

describe("Microsoft (Outlook / Hotmail) gönderen hesap olamaz", () => {
  it("Outlook seçeneği ve Hotmail/Outlook/Live adresleri bağlanmadan anlaşılır mesajla reddedilir", async () => {
    for (const input of [
      { provider: "outlook" as const, user: "dukkan@outlook.com", pass: "x" },
      { provider: "gmail" as const, user: "dukkan@hotmail.com", pass: "x" },
      { provider: "icloud" as const, user: "Dukkan@Live.com", pass: "x" },
      { provider: "yandex" as const, user: "dukkan@msn.com", pass: "x" },
    ]) {
      await expect(saveMailSettings(env.db, input)).rejects.toMatchObject({ code: "MAIL_PROVIDER_UNSUPPORTED" });
    }
    expect(readMailConfig(env.db)).toBeNull();
    // Gmail adresiyle sorun yok (test modunda bağlantı denenmez)
    await expect(saveMailSettings(env.db, { provider: "gmail", user: "dukkan@gmail.com", pass: "abcd efgh ijkl mnop" })).resolves.toBeTruthy();
  });

  it("Microsoft'un 'basic authentication' reddi sade Türkçeye çevrilir", () => {
    expect(friendlyMailError({ code: "EAUTH", responseCode: 535, response: "535 5.7.139 Authentication unsuccessful, basic authentication is disabled." }, "custom")).toBe(
      MICROSOFT_UNSUPPORTED,
    );
    expect(friendlyMailError({ code: "EAUTH", responseCode: 535, response: "535 5.7.8 Username and Password not accepted." }, "gmail")).toMatch(/uygulama şifresi/);
  });

  it("Hotmail adresi yönetici (alıcı) e-postası olarak kullanılabilir", () => {
    expect(isMicrosoftPersonal("ayse@hotmail.com")).toBe(true);
    expect(isMicrosoftPersonal("ayse@gmail.com")).toBe(false);
  });
});

describe("e-posta isteğe bağlı: bağlı değilken şifre/PIN doğrudan değişir", () => {
  function put(path: string, body: unknown, cookie: string): Request {
    return new Request(`http://localhost:3000${path}`, {
      method: "PUT",
      headers: new Headers({ host: "localhost:3000", cookie, "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
  }

  it("kasiyer PIN'i kodsuz değişir; yönetici kendi şifresinde mevcut şifreyi yazar", async () => {
    const { owner, cashier } = ensureUsers(env);
    setTestMailSender(null); // e-posta gönderimi bağlı değil
    const cookie = await cookieForUser(owner);

    const pin = await secretDirectRoute.PUT(put(`/api/users/${cashier.id}/secret`, { secret: "4455", secretConfirm: "4455" }, cookie), params({ id: String(cashier.id) }));
    expect(pin.status).toBe(200);
    expect(authenticateCashier_(cashier.cashierNo!, "4455")).toBe(true);
    const log = env.db.prepare("SELECT summary FROM audit_log WHERE action = 'user.secret' ORDER BY id DESC").get() as { summary: string };
    expect(log.summary).toContain("e-posta bağlı değil");

    const wrong = await secretDirectRoute.PUT(
      put(`/api/users/${owner.id}/secret`, { secret: "yeni-sifre-999", secretConfirm: "yeni-sifre-999", currentPassword: "yanlis-sifre" }, cookie),
      params({ id: String(owner.id) }),
    );
    expect(wrong.status).toBe(400);
    expect((await json(wrong)).error.code).toBe("WRONG_PASSWORD");
    const ok = await secretDirectRoute.PUT(
      put(`/api/users/${owner.id}/secret`, { secret: "yeni-sifre-999", secretConfirm: "yeni-sifre-999", currentPassword: TEST_OWNER.password }, cookie),
      params({ id: String(owner.id) }),
    );
    expect(ok.status).toBe(200);
    expect(authenticateOwner(env.ctx, TEST_OWNER.username, "yeni-sifre-999")).not.toBeNull();

    // kasiyer bu ucu kullanamaz (PIN değişince eski oturumu düştü: taze oturumla)
    const cashierCookie = await cookieForUser(getUserById(env.db, cashier.id)!);
    expect((await secretDirectRoute.PUT(put(`/api/users/${cashier.id}/secret`, { secret: "1212", secretConfirm: "1212" }, cashierCookie), params({ id: String(cashier.id) }))).status).toBe(403);
  });

  it("e-posta bağlı ve yöneticinin adresi varsa kodsuz değişiklik reddedilir (kod zorunlu)", async () => {
    const { owner, cashier } = ensureUsers(env); // test yöneticisinin e-postası var, gönderim yakalanıyor (bağlı sayılır)
    const r = await secretDirectRoute.PUT(
      put(`/api/users/${cashier.id}/secret`, { secret: "4455", secretConfirm: "4455" }, await cookieForUser(owner)),
      params({ id: String(cashier.id) }),
    );
    expect(r.status).toBe(409);
    expect((await json(r)).error.code).toBe("CODE_REQUIRED");
  });

  function authenticateCashier_(no: number, pin: string): boolean {
    return authenticateCashier(env.ctx, String(no), pin) !== null;
  }
});
