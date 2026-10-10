module.exports=[46569,r=>{"use strict";let u=`
  SELECT id, sale_id AS saleId, created_at AS createdAt, business_date AS businessDate,
         refund_total_kurus AS refundTotalKurus, net_total_kurus AS netTotalKurus,
         cost_total_kurus AS costTotalKurus, cost_net_total_kurus AS costNetTotalKurus, profit_reversal_kurus AS profitReversalKurus,
         refund_method AS refundMethod, reason
    FROM returns`;r.s(["T",0,function(r,u){return r.prepare("SELECT COUNT(*) AS c FROM returns WHERE sale_id = ?").get(u).c},"I",0,function(r,e){return r.prepare(`${u} WHERE id = ?`).get(e)},"e",0,function(r,u){return Number(r.prepare(`INSERT INTO returns (sale_id, created_at, business_date, refund_total_kurus, net_total_kurus,
                              cost_total_kurus, cost_net_total_kurus, profit_reversal_kurus, refund_method, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(u.saleId,u.createdAt,u.businessDate,u.refundTotalKurus,u.netTotalKurus,u.costTotalKurus,u.costNetTotalKurus,u.profitReversalKurus,u.refundMethod,u.reason).lastInsertRowid)},"l",0,function(r,u){return Number(r.prepare(`INSERT INTO return_items (return_id, sale_item_id, qty, refund_kurus, net_kurus, cost_kurus, cost_net_kurus,
                                   profit_reversal_kurus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(u.returnId,u.saleItemId,u.qty,u.refundKurus,u.netKurus,u.costKurus,u.costNetKurus,u.profitReversalKurus).lastInsertRowid)},"J",0,function(r,u){return r.prepare(`SELECT id, return_id AS returnId, sale_item_id AS saleItemId, qty, refund_kurus AS refundKurus,
              net_kurus AS netKurus, cost_kurus AS costKurus, cost_net_kurus AS costNetKurus, profit_reversal_kurus AS profitReversalKurus
         FROM return_items WHERE return_id = ? ORDER BY id`).all(u)},"u",0,function(r,e){return r.prepare(`${u} WHERE sale_id = ? ORDER BY id`).all(e)}])}];

//# sourceMappingURL=src_server_db_repositories_returns_ts_1tcnflimrimma._.js.map