import { beforeEach, describe, expect, it } from "vitest";
import { getCashierAggregates } from "@/server/db/repositories/reports";
import { buildReport } from "@/server/services/reports";
import { createReturn } from "@/server/services/returns";
import { completeSale } from "@/server/services/sales";
import { createUser } from "@/server/services/users";
import { voidSale } from "@/server/services/voids";
import { ensureUsers } from "../apiHelpers";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;

beforeEach(() => {
  env = createEnv("2026-10-06T06:00:00.000Z"); // İstanbul 09:00
  p = seedSample(env);
});

function as(user: { id: number; name: string; role: "owner" | "cashier" }) {
  return { ...env.ctx, actor: { userId: user.id, name: user.name, role: user.role } };
}
function sell(user: { id: number; name: string; role: "owner" | "cashier" }, items: { productId: number; qty: number }[], payment: "cash" | "card" = "cash") {
  return completeSale(as(user), { clientRequestId: uuid(), items, paymentMethod: payment }, { role: user.role });
}

describe("kasiyer performansı", () => {
  it("kasiyer başına satış, sepet, iptal, iade, kasada geçen süre — kuruşu kuruşuna", () => {
    const { owner, cashier } = ensureUsers(env);
    const ali = createUser(as(owner), { role: "cashier", name: "Ali", pin: "5511" });
    const idle = createUser(as(owner), { role: "cashier", name: "Boşta Kasiyer", pin: "7722" });

    // Mehmet (test kasiyeri): 09:00 kola×2 nakit (10.000), 09:30 cips×1 kart (7.000), 11:00 su×3 nakit (3.000) → sonra iptal
    sell(cashier, [{ productId: p.kola.id, qty: 2 }]);
    env.setNow("2026-10-06T06:30:00.000Z");
    const cardSale = sell(cashier, [{ productId: p.cips.id, qty: 1 }], "card");
    env.setNow("2026-10-06T08:00:00.000Z");
    const voided = sell(cashier, [{ productId: p.su.id, qty: 3 }]);
    voidSale(env.ctx, voided.sale.id, { reason: "yanlış" });
    // Ali: 10:00 kola×1 (5.000) → iadesi 12:00
    env.setNow("2026-10-06T07:00:00.000Z");
    const aliSale = sell(ali, [{ productId: p.kola.id, qty: 1 }]);
    env.setNow("2026-10-06T09:00:00.000Z");
    createReturn(env.ctx, { saleId: aliSale.sale.id, items: [{ saleItemId: aliSale.items[0]!.id, qty: 1 }], refundMethod: "cash" });

    const rows = getCashierAggregates(env.db, "2026-10-06", "2026-10-06");
    const m = rows.find((r) => r.userId === cashier.id)!;
    expect(m).toMatchObject({
      saleCount: 2,
      salesTotalKurus: 17000,
      cashKurus: 10000,
      cardKurus: 7000,
      itemsSold: 3,
      voidCount: 1,
      voidTotalKurus: 3000,
      returnCount: 0,
      activeDays: 1,
      activeMinutes: 30, // 09:00 → 09:30 (iptal edilen satış süreye girmez)
    });
    expect(m.grossProfitKurus).toBe(cardSale.sale.grossProfitKurus + (env.db.prepare("SELECT gross_profit_kurus AS g FROM sales WHERE user_id = ? AND status='completed' AND payment_method='cash'").get(cashier.id) as { g: number }).g);

    const a = rows.find((r) => r.userId === ali.id)!;
    expect(a).toMatchObject({ saleCount: 1, salesTotalKurus: 5000, returnCount: 1, refundKurus: 5000, itemsSold: 0, grossProfitKurus: 0 });

    // Satışı olmayan aktif kasiyer sıfırla listelenir; sıralama satış tutarına göre
    expect(rows.find((r) => r.userId === idle.id)).toMatchObject({ saleCount: 0, salesTotalKurus: 0 });
    expect(rows[0]!.userId).toBe(cashier.id);
    expectIntegrity(env);
  });

  it("rapor tablosu: kasiyer etiketi, ortalama sepet, saat başı satış ve toplamlar", () => {
    const { cashier } = ensureUsers(env);
    sell(cashier, [{ productId: p.kola.id, qty: 1 }]); // 09:00 5.000
    env.setNow("2026-10-06T07:00:00.000Z");
    sell(cashier, [{ productId: p.cips.id, qty: 1 }]); // 10:00 7.000
    const r = buildReport(env.ctx, "cashiers", "2026-10-06", "2026-10-06");
    expect(r.title).toBe("Kasiyer performansı");
    const row = r.rows.find((x) => String(x.name).startsWith(cashier.name))!;
    expect(row.name).toBe(`${cashier.name} (No ${cashier.cashierNo})`);
    expect(row).toMatchObject({ saleCount: 2, salesTotalKurus: 12000, avgBasketKurus: 6000, activeTime: "1 sa 0 dk", perHourKurus: 12000 });
    expect(r.totals).toMatchObject({ name: "Toplam", saleCount: 2, salesTotalKurus: 12000, avgBasketKurus: 6000 });
  });
});
