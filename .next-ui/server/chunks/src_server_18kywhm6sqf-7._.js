(()=>{"use strict";module.exports=[38753,e=>{e.s(["d",0,function(e,s){return e.prepare(`SELECT business_date AS businessDate, closed_at AS closedAt, summary_json AS summaryJson,
              expected_cash_kurus AS expectedCashKurus, counted_cash_kurus AS countedCashKurus,
              cash_difference_kurus AS cashDifferenceKurus, note, reopened_at AS reopenedAt, reopen_reason AS reopenReason
         FROM day_closings WHERE business_date = ?`).get(s)},"A",0,function(e,s){return!!e.prepare("SELECT 1 FROM day_closings WHERE business_date = ? AND reopened_at IS NULL").get(s)},"Y",0,function(e,s,r,u){e.prepare("UPDATE day_closings SET reopened_at = ?, reopen_reason = ? WHERE business_date = ?").run(r,u,s)},"D",0,function(e,s){e.prepare(`INSERT INTO day_closings (business_date, closed_at, summary_json, expected_cash_kurus, counted_cash_kurus,
                               cash_difference_kurus, note, reopened_at, reopen_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(business_date) DO UPDATE SET
       closed_at = excluded.closed_at, summary_json = excluded.summary_json,
       expected_cash_kurus = excluded.expected_cash_kurus, counted_cash_kurus = excluded.counted_cash_kurus,
       cash_difference_kurus = excluded.cash_difference_kurus, note = excluded.note,
       reopened_at = NULL, reopen_reason = NULL`).run(s.businessDate,s.closedAt,s.summaryJson,s.expectedCashKurus,s.countedCashKurus,s.cashDifferenceKurus,s.note)}])},3539,e=>{var s=e.i(77830),r=e.i(32355),u=e.i(19193),n=e.i(74491);e.s(["j",0,function(e,u){let t=(0,r.O)(e.db,u,u),a=e=>[...t].filter(s=>s[e]>0).sort((s,r)=>r[e]-s[e]||s.name.localeCompare(r.name,"tr")).slice(0,10);return{date:u,today:(0,n.l)(e),summary:(0,r.c)(e.db,u,u),compare:{yesterday:(0,r.c)(e.db,(0,s.b)(u,-1),(0,s.b)(u,-1)),lastWeek:(0,r.c)(e.db,(0,s.b)(u,-7),(0,s.b)(u,-7))},hourly:(0,r.A)(e.db,u),topByQty:a("qty"),topByProfit:a("grossProfitKurus"),stock:(0,r.o)(e.db),sales:(0,r.Z)(e.db,u),closing:(0,n.d)(e,u)}},"U",0,function(e,r){if(!r)return(0,n.l)(e);if(!(0,s.R)(r))throw(0,u.O)("BAD_DATE","Geçersiz tarih.");return r}])}]})();

//# sourceMappingURL=src_server_18kywhm6sqf-7._.js.map