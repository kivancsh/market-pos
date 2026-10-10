module.exports=[90398,t=>{"use strict";let u=`
  SELECT id, receipt_no AS receiptNo, client_request_id AS clientRequestId, created_at AS createdAt,
         business_date AS businessDate, status, payment_method AS paymentMethod,
         subtotal_kurus AS subtotalKurus, discount_kurus AS discountKurus, total_kurus AS totalKurus,
         net_total_kurus AS netTotalKurus, vat_total_kurus AS vatTotalKurus,
         cost_total_kurus AS costTotalKurus, cost_net_total_kurus AS costNetTotalKurus,
         gross_profit_kurus AS grossProfitKurus, cash_received_kurus AS cashReceivedKurus,
         change_kurus AS changeKurus, created_by_role AS createdByRole, user_id AS userId, user_name AS userName,
         voided_at AS voidedAt, void_reason AS voidReason
    FROM sales`,e=`
  SELECT id, sale_id AS saleId, product_id AS productId, product_name_snapshot AS productNameSnapshot,
         barcode_snapshot AS barcodeSnapshot, qty, unit_price_kurus AS unitPriceKurus,
         unit_cost_kurus AS unitCostKurus, vat_rate AS vatRate, line_discount_kurus AS lineDiscountKurus,
         line_total_kurus AS lineTotalKurus, line_net_kurus AS lineNetKurus, line_vat_kurus AS lineVatKurus,
         line_cost_kurus AS lineCostKurus, line_cost_net_kurus AS lineCostNetKurus,
         line_profit_kurus AS lineProfitKurus, returned_qty AS returnedQty
    FROM sale_items`;t.s(["z",0,function(t,u,e){t.prepare("UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?").run(e,u)},"U",0,function(t,e){return t.prepare(`${u} WHERE client_request_id = ?`).get(e)},"l",0,function(t,e){return t.prepare(`${u} WHERE id = ?`).get(e)},"j",0,function(t,e){return t.prepare(`${u} WHERE receipt_no = ?`).get(e)},"u",0,function(t,u){return t.prepare(`${e} WHERE sale_id = ? ORDER BY id`).all(u)},"w",0,function(t,u){return Number(t.prepare(`INSERT INTO sales (receipt_no, client_request_id, created_at, business_date, status, payment_method,
                            subtotal_kurus, discount_kurus, total_kurus, net_total_kurus, vat_total_kurus,
                            cost_total_kurus, cost_net_total_kurus, gross_profit_kurus,
                            cash_received_kurus, change_kurus, created_by_role, user_id, user_name)
         VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(u.receiptNo,u.clientRequestId,u.createdAt,u.businessDate,u.paymentMethod,u.subtotalKurus,u.discountKurus,u.totalKurus,u.netTotalKurus,u.vatTotalKurus,u.costTotalKurus,u.costNetTotalKurus,u.grossProfitKurus,u.cashReceivedKurus,u.changeKurus,u.createdByRole,u.userId,u.userName).lastInsertRowid)},"M",0,function(t,u){return Number(t.prepare(`INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, barcode_snapshot, qty,
                                 unit_price_kurus, unit_cost_kurus, vat_rate, line_discount_kurus,
                                 line_total_kurus, line_net_kurus, line_vat_kurus, line_cost_kurus,
                                 line_cost_net_kurus, line_profit_kurus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(u.saleId,u.productId,u.productNameSnapshot,u.barcodeSnapshot,u.qty,u.unitPriceKurus,u.unitCostKurus,u.vatRate,u.lineDiscountKurus,u.lineTotalKurus,u.lineNetKurus,u.lineVatKurus,u.lineCostKurus,u.lineCostNetKurus,u.lineProfitKurus).lastInsertRowid)},"o",0,function(t,u,e,s){t.prepare("UPDATE sales SET status = 'voided', voided_at = ?, void_reason = ? WHERE id = ?").run(e,s,u)},"B",0,function(t,u){return t.prepare(`SELECT COALESCE(MAX(CAST(substr(receipt_no, 10) AS INTEGER)), 0) AS maxSeq
         FROM sales WHERE business_date = ?`).get(u).maxSeq+1}])}];

//# sourceMappingURL=src_server_db_repositories_sales_ts_0jxahmg86hodq._.js.map