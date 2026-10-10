(()=>{"use strict";module.exports=[38753,e=>{e.s(["d",0,function(e,s){return e.prepare(`SELECT business_date AS businessDate, closed_at AS closedAt, summary_json AS summaryJson,
              expected_cash_kurus AS expectedCashKurus, counted_cash_kurus AS countedCashKurus,
              cash_difference_kurus AS cashDifferenceKurus, note, reopened_at AS reopenedAt, reopen_reason AS reopenReason
         FROM day_closings WHERE business_date = ?`).get(s)},"A",0,function(e,s){return!!e.prepare("SELECT 1 FROM day_closings WHERE business_date = ? AND reopened_at IS NULL").get(s)},"Y",0,function(e,s,u,n){e.prepare("UPDATE day_closings SET reopened_at = ?, reopen_reason = ? WHERE business_date = ?").run(u,n,s)},"D",0,function(e,s){e.prepare(`INSERT INTO day_closings (business_date, closed_at, summary_json, expected_cash_kurus, counted_cash_kurus,
                               cash_difference_kurus, note, reopened_at, reopen_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(business_date) DO UPDATE SET
       closed_at = excluded.closed_at, summary_json = excluded.summary_json,
       expected_cash_kurus = excluded.expected_cash_kurus, counted_cash_kurus = excluded.counted_cash_kurus,
       cash_difference_kurus = excluded.cash_difference_kurus, note = excluded.note,
       reopened_at = NULL, reopen_reason = NULL`).run(s.businessDate,s.closedAt,s.summaryJson,s.expectedCashKurus,s.countedCashKurus,s.cashDifferenceKurus,s.note)}])},71819,e=>{e.s(["w",0,function(e,s){let u=e.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_kurus), 0) AS total
         FROM sales WHERE business_date = ? AND status = 'completed'`).get(s),n=e.prepare("SELECT COALESCE(SUM(refund_total_kurus), 0) AS refunds FROM returns WHERE business_date = ?").get(s);return{saleCount:u.n,revenueKurus:u.total-n.refunds}},"j",0,function(e,s,u,n){return e.prepare(`SELECT s.business_date AS businessDate, SUM(i.qty) AS qty, SUM(i.line_total_kurus) AS revenueKurus
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
        WHERE i.product_id = ? AND s.status = 'completed' AND s.business_date BETWEEN ? AND ?
        GROUP BY s.business_date ORDER BY s.business_date`).all(s,u,n)}])}]})();

//# sourceMappingURL=src_server_db_repositories_1unw_8vhsiv-9._.js.map