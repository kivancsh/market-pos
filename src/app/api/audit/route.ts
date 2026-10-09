import { listAudit } from "@/server/db/repositories/audit";
import { listUsers } from "@/server/db/repositories/users";
import { apiRoute } from "@/server/http/api";
import { AUDIT_ACTIONS } from "@/server/services/audit";
import { parseRange } from "@/server/services/reports";

const PAGE = 100;

/** İşlem geçmişi: ?from&to&action&userId&page */
export const GET = apiRoute(["owner"], ({ req, ctx }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = parseRange(ctx, sp.get("from"), sp.get("to"));
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const userId = Number(sp.get("userId")) || null;
  const action = sp.get("action") || null;
  const r = listAudit(ctx.db, { from, to, action, userId, limit: PAGE, offset: (page - 1) * PAGE });
  return {
    ...r,
    page,
    pageSize: PAGE,
    from,
    to,
    actions: AUDIT_ACTIONS,
    users: listUsers(ctx.db).map((u) => ({ id: u.id, name: u.name, role: u.role })),
  };
});
