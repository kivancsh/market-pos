import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sealData } from "iron-session";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as backupsRoute from "@/app/api/backups/route";
import * as dashboardRoute from "@/app/api/dashboard/route";
import * as reopenRoute from "@/app/api/day-closings/[date]/reopen/route";
import * as closingRoute from "@/app/api/day-closings/[date]/route";
import * as closeRoute from "@/app/api/day-closings/route";
import * as byReceiptRoute from "@/app/api/sales/by-receipt/[receiptNo]/route";
import * as salesRoute from "@/app/api/sales/route";
import { getSessionSecret } from "@/server/auth/secret";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";
import { setTestCtxFactory } from "@/server/http/api";
import { createEnv, expectIntegrity, seedSample, uuid, type TestEnv } from "../helpers";

let env: TestEnv;
let p: ReturnType<typeof seedSample>;
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-api-backup-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => {
  delete process.env.BACKUP_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
  setTestCtxFactory(undefined);
});
beforeEach(() => {
  env = createEnv();
  p = seedSample(env);
  setTestCtxFactory(() => env.ctx);
});

async function cookie(role: "owner" | "cashier") {
  return `${SESSION_COOKIE}=${await sealData({ role, loginAt: "x" }, { password: getSessionSecret(), ttl: SESSION_TTL_SECONDS })}`;
}
function req(p: string, c: string, body?: unknown) {
  return new Request(`http://localhost:3000${p}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { host: "localhost:3000", cookie: c, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = <T>(v: T) => ({ params: Promise.resolve(v) });
const sellBody = (productId: number, qty: number, paymentMethod: "cash" | "card" = "cash") => ({
  clientRequestId: uuid(),
  items: [{ productId, qty }],
  paymentMethod,
});

describe("panel ve gün sonu API", () => {
  it("kasiyer panel, satış listesi, fiş arama, kapanış ve yedek uçlarına erişemez", async () => {
    const c = await cookie("cashier");
    const rs = await Promise.all([
      dashboardRoute.GET(req("/api/dashboard", c)),
      salesRoute.GET(req("/api/sales?date=2026-10-06", c)),
      byReceiptRoute.GET(req("/api/sales/by-receipt/x", c), params({ receiptNo: "x" })),
      closeRoute.POST(req("/api/day-closings", c, {})),
      closingRoute.GET(req("/api/day-closings/2026-10-06", c), params({ date: "2026-10-06" })),
      reopenRoute.POST(req("/api/day-closings/2026-10-06/reopen", c, { reason: "xxx" }), params({ date: "2026-10-06" })),
      backupsRoute.GET(req("/api/backups", c)),
      backupsRoute.POST(req("/api/backups", c, {})),
    ]);
    expect(rs.map((r) => r.status)).toEqual(Array(rs.length).fill(403));
  });

  it("panel verisi; geçersiz tarih 400", async () => {
    const o = await cookie("owner");
    await salesRoute.POST(req("/api/sales", o, sellBody(p.kola.id, 2)));
    const d = (await (await dashboardRoute.GET(req("/api/dashboard", o))).json()) as {
      date: string;
      summary: { revenueGrossKurus: number; saleCount: number };
      sales: unknown[];
    };
    expect(d.date).toBe("2026-10-06");
    expect(d.summary).toMatchObject({ revenueGrossKurus: 10000, saleCount: 1 });
    expect(d.sales).toHaveLength(1);
    expect((await dashboardRoute.GET(req("/api/dashboard?date=2026-02-30", o))).status).toBe(400);
  });

  it("fiş numarasıyla bulma (tireli ve tiresiz)", async () => {
    const o = await cookie("owner");
    const s = (await (await salesRoute.POST(req("/api/sales", o, sellBody(p.su.id, 1)))).json()) as { sale: { id: number } };
    for (const no of ["20261006-0001", "202610060001"]) {
      const r = (await (await byReceiptRoute.GET(req(`/api/sales/by-receipt/${no}`, o), params({ receiptNo: no }))).json()) as { id: number };
      expect(r.id).toBe(s.sale.id);
    }
    expect((await byReceiptRoute.GET(req("/api/sales/by-receipt/20261006-0099", o), params({ receiptNo: "20261006-0099" }))).status).toBe(404);
  });

  it("günü kapat → otomatik yedek; kapalı güne satış 409; yeniden aç → satış", async () => {
    const o = await cookie("owner");
    await salesRoute.POST(req("/api/sales", o, sellBody(p.kola.id, 1)));
    const close = await closeRoute.POST(req("/api/day-closings", o, { countedCashKurus: 5000 }));
    expect(close.status).toBe(200);
    const body = (await close.json()) as { closing: { closed: boolean; cashDifferenceKurus: number }; backup: { ok: boolean; file: string } };
    expect(body.closing).toMatchObject({ closed: true, cashDifferenceKurus: 0 });
    expect(body.backup.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, body.backup.file))).toBe(true);

    const blocked = await salesRoute.POST(req("/api/sales", await cookie("cashier"), sellBody(p.su.id, 1)));
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: { message: string } }).error.message).toContain("Gün kapatıldı");

    const re = await reopenRoute.POST(req("/api/day-closings/2026-10-06/reopen", o, { reason: "Unutulan satış" }), params({ date: "2026-10-06" }));
    expect(re.status).toBe(200);
    expect((await salesRoute.POST(req("/api/sales", o, sellBody(p.su.id, 1)))).status).toBe(200);

    const list = (await (await backupsRoute.GET(req("/api/backups", o))).json()) as { items: { name: string }[] };
    expect(list.items.map((b) => b.name)).toContain(body.backup.file);
    expectIntegrity(env);
  });
});
