import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAudit } from "@/server/db/repositories/audit";
import { getProductById } from "@/server/db/repositories/products";
import { AppError } from "@/server/errors";
import { applyBulkPrice, previewBulkPrice } from "@/server/services/bulkPrice";
import { createCategory, listCategoriesForAdmin, removeCategory, updateCategory } from "@/server/services/categories";
import { updateProduct } from "@/server/services/products";
import { completeSale } from "@/server/services/sales";
import { updateSettings } from "@/server/services/settings";
import { voidSale } from "@/server/services/voids";
import { authenticateCashier, authenticateOwner, changeOwnPassword, createUser, resetOwnerPassword, updateUser } from "@/server/services/users";
import { TEST_OWNER, ensureUsers } from "../apiHelpers";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;
let ctx: TestEnv["ctx"];

beforeEach(() => {
  env = createEnv();
  p = seedSample(env);
  const { owner } = ensureUsers(env);
  ctx = { ...env.ctx, actor: { userId: owner.id, name: owner.name, role: "owner" } };
});
afterEach(() => expectIntegrity(env));

function catchErr(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("Hata bekleniyordu");
}
const lastAudit = () => listAudit(env.db, { from: "2000-01-01", to: "2100-01-01", limit: 1, offset: 0 }).items[0]!;

describe("kullanıcı yönetimi", () => {
  it("kasiyer ekler; aynı PIN ikinci kasiyere verilemez", () => {
    const k = createUser(ctx, { role: "cashier", name: "Ali", pin: "1357" });
    expect(k).toMatchObject({ role: "cashier", name: "Ali", isActive: true });
    expect(authenticateCashier(ctx, "1357")?.id).toBe(k.id);
    expect(catchErr(() => createUser(ctx, { role: "cashier", name: "Veli", pin: "1357" })).code).toBe("PIN_TAKEN");
    expect(catchErr(() => createUser(ctx, { role: "cashier", name: "Veli", pin: "12" })).status).toBe(400);
    expect(lastAudit().summary).toContain("Kasiyer eklendi: Ali");
  });

  it("ikinci yönetici eklenir; kullanıcı adı benzersiz (büyük/küçük harf duyarsız)", () => {
    createUser(ctx, { role: "owner", name: "Can", username: "can", password: "sifre-12345" });
    expect(authenticateOwner(ctx, "CAN", "sifre-12345")?.name).toBe("Can");
    expect(catchErr(() => createUser(ctx, { role: "owner", name: "X", username: "Yonetici", password: "sifre-12345" })).code).toBe("USERNAME_TAKEN");
  });

  it("kendini ve son yöneticiyi pasife alamaz; tekrar aktif edilen kasiyere yeni PIN zorunlu", () => {
    const { owner, cashier } = ensureUsers(env);
    expect(catchErr(() => updateUser(ctx, owner.id, { isActive: false })).code).toBe("CANNOT_DEACTIVATE_SELF");
    const other = { ...env.ctx, actor: { userId: cashier.id, name: "x", role: "owner" as const } };
    expect(catchErr(() => updateUser(other, owner.id, { isActive: false })).code).toBe("LAST_OWNER");

    updateUser(ctx, cashier.id, { isActive: false });
    expect(catchErr(() => updateUser(ctx, cashier.id, { isActive: true })).code).toBe("PIN_REQUIRED");
    expect(updateUser(ctx, cashier.id, { isActive: true, pin: "2468" }).isActive).toBe(true);
  });

  it("kendi şifresini değiştirir (mevcut şifre doğrulanır); bilgisayardan sıfırlanabilir", () => {
    expect(catchErr(() => changeOwnPassword(ctx, { currentPassword: "yanlis", newPassword: "yeni-sifre-1", newPasswordConfirm: "yeni-sifre-1" })).code).toBe(
      "WRONG_PASSWORD",
    );
    expect(catchErr(() => changeOwnPassword(ctx, { currentPassword: TEST_OWNER.password, newPassword: "yeni-sifre-1", newPasswordConfirm: "farkli" })).status).toBe(400);
    changeOwnPassword(ctx, { currentPassword: TEST_OWNER.password, newPassword: "yeni-sifre-1", newPasswordConfirm: "yeni-sifre-1" });
    expect(authenticateOwner(ctx, TEST_OWNER.username, TEST_OWNER.password)).toBeNull();
    expect(authenticateOwner(ctx, TEST_OWNER.username, "yeni-sifre-1")).not.toBeNull();
    resetOwnerPassword(env.ctx, TEST_OWNER.username, "kurtarma-sifre-9");
    expect(authenticateOwner(ctx, TEST_OWNER.username, "kurtarma-sifre-9")).not.toBeNull();
  });

  it("şifreler veritabanında açık metin olarak durmaz", () => {
    const rows = env.db.prepare("SELECT password_hash AS p, pin_hash AS h FROM users").all() as { p: string | null; h: string | null }[];
    for (const r of rows) {
      for (const v of [r.p, r.h]) if (v) expect(v).toMatch(/^scrypt\$/);
    }
    expect(JSON.stringify(rows)).not.toContain(TEST_OWNER.password);
  });
});

describe("satışı kim yaptı + işlem geçmişi", () => {
  it("satış kullanıcı adıyla kaydedilir; fiyat değişikliği, iptal ve ayar değişikliği geçmişe yazılır", () => {
    const { cashier } = ensureUsers(env);
    const cashierCtx = { ...env.ctx, actor: { userId: cashier.id, name: cashier.name, role: "cashier" as const } };
    const s = completeSale(cashierCtx, { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 1 }], paymentMethod: "card" }, { role: "cashier" });
    expect(s.sale).toMatchObject({ userId: cashier.id, userName: cashier.name });

    updateProduct(ctx, p.kola.id, { salePriceKurus: 5500 });
    expect(lastAudit()).toMatchObject({ action: "product.price", summary: "Kola 1 L: ₺50,00 → ₺55,00", userName: TEST_OWNER.name });

    voidSale(ctx, s.sale.id, { reason: "yanlış ürün" });
    expect(lastAudit()).toMatchObject({ action: "sale.void" });
    expect(lastAudit().summary).toContain("iptal edildi");

    updateSettings(ctx, { openingCashKurus: 50000, soundEnabled: false });
    expect(lastAudit().summary).toBe("ses: açık → kapalı; açılış kasası: ₺0,00 → ₺500,00");
  });
});

describe("kategoriler", () => {
  it("ekle, yeniden adlandır, boşsa sil; doluysa silinemez; aynı ad iki kez olamaz", () => {
    const c = createCategory(ctx, { name: "Unlu Mamuller" });
    expect(catchErr(() => createCategory(ctx, { name: "unlu mamuller" })).code).toBe("CATEGORY_EXISTS");
    updateCategory(ctx, c.id, { name: "Fırın" });
    expect(listCategoriesForAdmin(ctx).find((x) => x.id === c.id)).toMatchObject({ name: "Fırın", productCount: 0 });
    removeCategory(ctx, c.id);
    const icecek = listCategoriesForAdmin(ctx).find((x) => x.name === "İçecek")!;
    expect(icecek.productCount).toBe(2);
    expect(catchErr(() => removeCategory(ctx, icecek.id)).code).toBe("CATEGORY_NOT_EMPTY");
  });
});

describe("toplu fiyat güncelleme", () => {
  it("önizleme hiçbir şey değiştirmez; uygulama sadece kapsamdaki ürünleri günceller ve tek kayıt yazar", () => {
    const icecek = listCategoriesForAdmin(ctx).find((x) => x.name === "İçecek")!;
    const input = {
      scope: { type: "category" as const, categoryId: icecek.id },
      change: { mode: "percent" as const, direction: "increase" as const, value: 1000, rounding: "r50" as const },
    };
    const prev = previewBulkPrice(ctx, input);
    expect(prev.rows.map((r) => [r.name, r.oldPriceKurus, r.newPriceKurus])).toEqual([
      ["Kola 1 L", 5000, 5500],
      ["Su 0,5 L", 1000, 1100],
    ]);
    expect(getProductById(env.db, p.kola.id)!.salePriceKurus).toBe(5000);

    expect(applyBulkPrice(ctx, input)).toEqual({ updated: 2 });
    expect(getProductById(env.db, p.kola.id)!.salePriceKurus).toBe(5500);
    expect(getProductById(env.db, p.cips.id)!.salePriceKurus).toBe(7000); // kapsam dışı
    expect(lastAudit()).toMatchObject({ action: "product.bulk_price", summary: "Toplu fiyat güncelleme: 2 ürün, %10 artış" });
  });

  it("fiyatı sıfıra düşürecek değişiklik hiçbir ürünü değiştirmez", () => {
    const e = catchErr(() =>
      applyBulkPrice(ctx, {
        scope: { type: "products", productIds: [p.su.id, p.kola.id] },
        change: { mode: "amount", direction: "decrease", value: 2000, rounding: "none" },
      }),
    );
    expect(e.code).toBe("INVALID_PRICES");
    expect(getProductById(env.db, p.kola.id)!.salePriceKurus).toBe(5000);
  });

  it("maliyetin altına düşen ürün işaretlenir", () => {
    const r = previewBulkPrice(ctx, {
      scope: { type: "products", productIds: [p.kola.id] },
      change: { mode: "percent", direction: "decrease", value: 5000, rounding: "none" },
    });
    expect(r.rows[0]).toMatchObject({ newPriceKurus: 2500, belowCost: true });
  });
});
