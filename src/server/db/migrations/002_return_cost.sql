-- 002: İadelerde KDV dahil maliyet payı da saklanır (raporlardaki "KDV dahil fark" iadelerde de kuruşu kuruşuna doğru olsun).
ALTER TABLE return_items ADD COLUMN cost_kurus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE returns ADD COLUMN cost_total_kurus INTEGER NOT NULL DEFAULT 0;

-- Mevcut kayıtlar: satır maliyetinin iade edilen adede düşen payı (yarım yukarı tam sayı yuvarlama).
UPDATE return_items
   SET cost_kurus = (
     SELECT (2 * si.line_cost_kurus * return_items.qty + si.qty) / (2 * si.qty)
       FROM sale_items si WHERE si.id = return_items.sale_item_id
   );
UPDATE returns
   SET cost_total_kurus = (SELECT COALESCE(SUM(ri.cost_kurus), 0) FROM return_items ri WHERE ri.return_id = returns.id);
