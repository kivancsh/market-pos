import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as expensesRoute from "@/app/api/expenses/route";
import * as expenseRoute from "@/app/api/expenses/[id]/route";
import { setTestCtxFactory } from "@/server/http/api";
import { getMonthlyProfitLoss, getProfitLoss } from "@/server/services/expenses";
import { buildReport } from "@/server/services/reports";
import { createReturn } from "@/server/services/returns";
import { completeSale } from "@/server/services/sales";
import { cookieForUser, ensureUsers } from "../apiHelpers";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;

beforeEach(() => {
  env = createEnv("2026-10-06T09:00:00.000Z");
  p = seedSample(env);
  setTestCtxFactory(() => env.ctx);
});
afterAll(() => setTestCtxFactory(undefined));

function req(path: string, cookie: string, method = "GET", body?: unknown): Request {
  const headers = new Headers({ host: "localhost:3000", cookie });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const params = <T,>(v: T) => ({ params: Promise.resolve(v) });

describe("giderler", () => {
  it("ekle (KDV ayrılır), düzelt, sil; kasiyer erişemez; hatalı girişler reddedilir", async () => {
    const { owner, cashier } = ensureUsers(env);
    const cookie = await cookieForUser(owner);

    const elec = await expensesRoute.POST(req("/api/expenses", cookie, "POST", { businessDate: "2026-10-03", category: "elektrik", description: "Eylül faturası", amountKurus: 120000, vatRate: 20 }));
    expect(elec.status).toBe(200);
    const e = (await json(elec)).expense;
    expect(e).toMatchObject({ amountKurus: 120000, netKurus: 100000, vatKurus: 20000, category: "elektrik" });
    await expensesRoute.POST(req("/api/expenses", cookie, "POST", { businessDate: "2026-10-01", category: "kira", amountKurus: 2500000, vatRate: 0 }));

    // hatalı: tutar 0, bilinmeyen kategori, geçersiz KDV
    for (const bad of [
      { businessDate: "2026-10-01", category: "kira", amountKurus: 0, vatRate: 0 },
      { businessDate: "2026-10-01", category: "eglence", amountKurus: 100, vatRate: 0 },
      { businessDate: "2026-10-01", category: "kira", amountKurus: 100, vatRate: 8 },
    ]) {
      expect((await expensesRoute.POST(req("/api/expenses", cookie, "POST", bad))).status).toBe(400);
    }
    // kasiyer erişemez
    const cc = await cookieForUser(cashier);
    expect((await expensesRoute.GET(req("/api/expenses?from=2026-10-01&to=2026-10-31", cc))).status).toBe(403);
    expect((await expensesRoute.POST(req("/api/expenses", cc, "POST", { businessDate: "2026-10-01", category: "kira", amountKurus: 100, vatRate: 0 }))).status).toBe(403);

    const list = await json(await expensesRoute.GET(req("/api/expenses?from=2026-10-01&to=2026-10-31", cookie)));
    expect(list.items).toHaveLength(2);
    expect(list.totals).toMatchObject({ amountKurus: 2620000, netKurus: 2600000, vatKurus: 20000 });

    // düzelt
    const upd = await expenseRoute.PATCH(req(`/api/expenses/${e.id}`, cookie, "PATCH", { businessDate: "2026-10-03", category: "elektrik", description: "Eylül faturası", amountKurus: 132000, vatRate: 20 }), params({ id: String(e.id) }));
    expect((await json(upd)).expense).toMatchObject({ amountKurus: 132000, netKurus: 110000, vatKurus: 22000 });
    // sil → listede ve toplamda yok, kayıt kaybolmaz
    expect((await expenseRoute.DELETE(req(`/api/expenses/${e.id}`, cookie, "DELETE"), params({ id: String(e.id) }))).status).toBe(200);
    const after = await json(await expensesRoute.GET(req("/api/expenses?from=2026-10-01&to=2026-10-31", cookie)));
    expect(after.items).toHaveLength(1);
    expect(after.totals.amountKurus).toBe(2500000);
    expect(env.db.prepare("SELECT COUNT(*) AS n FROM expenses").get()).toEqual({ n: 2 });
    const audit = env.db.prepare("SELECT action FROM audit_log WHERE action LIKE 'expense.%' ORDER BY id").all() as { action: string }[];
    expect(audit.map((a) => a.action)).toEqual(["expense.create", "expense.create", "expense.update", "expense.delete"]);
  });
});

describe("kâr-zarar", () => {
  it("net satış − maliyet = brüt kâr; − gider = net kâr; KDV özeti", async () => {
    const { owner } = ensureUsers(env);
    const ctx = { ...env.ctx, actor: { userId: owner.id, name: owner.name, role: "owner" as const } };
    // kola×2 (KDV %20, 5.000) + cips×1 (KDV %10, 7.000) → 17.000 KDV dahil
    const s = completeSale(ctx, { clientRequestId: uuid(), items: [{ productId: p.kola.id, qty: 2 }, { productId: p.cips.id, qty: 1 }], paymentMethod: "cash" }, { role: "owner" });
    createReturn(ctx, { saleId: s.sale.id, items: [{ saleItemId: s.items[0]!.id, qty: 1 }] }); // bir kola iade
    const cookie = await cookieForUser(owner);
    await expensesRoute.POST(req("/api/expenses", cookie, "POST", { businessDate: "2026-10-06", category: "kira", amountKurus: 3000, vatRate: 0 }));
    await expensesRoute.POST(req("/api/expenses", cookie, "POST", { businessDate: "2026-10-06", category: "elektrik", amountKurus: 1200, vatRate: 20 }));

    const pl = getProfitLoss(env.ctx, "2026-10-01", "2026-10-31");
    expect(pl.salesGrossKurus).toBe(17000);
    expect(pl.refundsKurus).toBe(5000);
    expect(pl.revenueGrossKurus).toBe(12000);
    // kola satırı 10.000 → net 8.333; 1 kola iadesi birikimli payla 4.167 düşer; cips 7.000 → net 6.364
    expect(pl.revenueNetKurus).toBe(8333 - 4167 + 6364);
    expect(pl.grossProfitKurus).toBe(pl.revenueNetKurus - pl.costNetKurus);
    expect(pl.expenses.netKurus).toBe(3000 + 1000);
    expect(pl.netProfitKurus).toBe(pl.grossProfitKurus - 4000);
    expect(pl.vat.salesVatKurus).toBe(12000 - pl.revenueNetKurus);
    expect(pl.vat.expenseVatKurus).toBe(200);
    expect(pl.vat.balanceKurus).toBe(pl.vat.salesVatKurus - pl.vat.purchaseVatKurus - 200);

    const report = buildReport(env.ctx, "profit-loss", "2026-10-01", "2026-10-31");
    expect(report.rows.find((r) => r.item === "NET KÂR")!.amountKurus).toBe(pl.netProfitKurus);
    expect(report.rows.find((r) => r.item === "Gider: Kira (KDV hariç)")!.amountKurus).toBe(-3000);
    const exp = buildReport(env.ctx, "expenses", "2026-10-01", "2026-10-31");
    expect(exp.rows).toHaveLength(2);
    expect(exp.totals).toMatchObject({ amountKurus: 4200, netKurus: 4000, vatKurus: 200 });

    const months = getMonthlyProfitLoss(env.ctx, "2026-10-06");
    expect(months).toHaveLength(12);
    expect(months.at(-1)).toMatchObject({ month: "2026-10", netProfitKurus: pl.netProfitKurus });
    expect(months[0]!.month).toBe("2025-11");
    expectIntegrity(env);
  });
});
