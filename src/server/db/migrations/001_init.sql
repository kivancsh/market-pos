-- 001_init: temel şema. Tüm para alanları *_kurus ve INTEGER'dır.

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  sale_price_kurus INTEGER NOT NULL CHECK (sale_price_kurus >= 0),
  avg_cost_kurus INTEGER NOT NULL DEFAULT 0 CHECK (avg_cost_kurus >= 0),
  vat_rate INTEGER NOT NULL DEFAULT 20 CHECK (vat_rate IN (1, 10, 20)),
  stock_qty INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit TEXT NOT NULL DEFAULT 'adet',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE product_barcodes (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  barcode TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('internal', 'manufacturer')),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_product_barcodes_product ON product_barcodes(product_id);
-- Her ürün için en fazla bir birincil barkod
CREATE UNIQUE INDEX ux_product_barcodes_primary
  ON product_barcodes(product_id) WHERE is_primary = 1;

CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  client_request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'voided')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),
  subtotal_kurus INTEGER NOT NULL CHECK (subtotal_kurus >= 0),
  discount_kurus INTEGER NOT NULL DEFAULT 0 CHECK (discount_kurus >= 0),
  total_kurus INTEGER NOT NULL CHECK (total_kurus >= 0),
  net_total_kurus INTEGER NOT NULL,
  vat_total_kurus INTEGER NOT NULL,
  cost_total_kurus INTEGER NOT NULL,
  cost_net_total_kurus INTEGER NOT NULL,
  gross_profit_kurus INTEGER NOT NULL,
  cash_received_kurus INTEGER,
  change_kurus INTEGER,
  created_by_role TEXT NOT NULL CHECK (created_by_role IN ('owner', 'cashier')),
  voided_at TEXT,
  void_reason TEXT
);
CREATE INDEX idx_sales_business_date ON sales(business_date);

CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  barcode_snapshot TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_kurus INTEGER NOT NULL,
  unit_cost_kurus INTEGER NOT NULL,
  vat_rate INTEGER NOT NULL,
  line_discount_kurus INTEGER NOT NULL DEFAULT 0,
  line_total_kurus INTEGER NOT NULL,
  line_net_kurus INTEGER NOT NULL,
  line_vat_kurus INTEGER NOT NULL,
  line_cost_kurus INTEGER NOT NULL,
  line_cost_net_kurus INTEGER NOT NULL,
  line_profit_kurus INTEGER NOT NULL,
  returned_qty INTEGER NOT NULL DEFAULT 0 CHECK (returned_qty >= 0 AND returned_qty <= qty)
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

CREATE TABLE returns (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  created_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  refund_total_kurus INTEGER NOT NULL,
  net_total_kurus INTEGER NOT NULL,
  cost_net_total_kurus INTEGER NOT NULL,
  profit_reversal_kurus INTEGER NOT NULL,
  refund_method TEXT NOT NULL CHECK (refund_method IN ('cash', 'card')),
  reason TEXT
);
CREATE INDEX idx_returns_business_date ON returns(business_date);
CREATE INDEX idx_returns_sale ON returns(sale_id);

CREATE TABLE return_items (
  id INTEGER PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES returns(id),
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  refund_kurus INTEGER NOT NULL,
  net_kurus INTEGER NOT NULL,
  cost_net_kurus INTEGER NOT NULL,
  profit_reversal_kurus INTEGER NOT NULL
);
CREATE INDEX idx_return_items_return ON return_items(return_id);

CREATE TABLE purchases (
  id INTEGER PRIMARY KEY,
  supplier TEXT,
  invoice_no TEXT,
  created_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  total_cost_kurus INTEGER NOT NULL,
  note TEXT
);

CREATE TABLE purchase_items (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_cost_kurus INTEGER NOT NULL CHECK (unit_cost_kurus >= 0)
);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);

CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK (type IN ('initial', 'sale', 'void', 'return', 'purchase', 'adjustment')),
  qty_change INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  unit_cost_kurus INTEGER,
  ref_type TEXT,
  ref_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  business_date TEXT NOT NULL
);
CREATE INDEX idx_stock_movements_product_created ON stock_movements(product_id, created_at);

CREATE TABLE day_closings (
  business_date TEXT PRIMARY KEY,
  closed_at TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  expected_cash_kurus INTEGER NOT NULL,
  counted_cash_kurus INTEGER,
  cash_difference_kurus INTEGER,
  note TEXT,
  -- Gün yeniden açılırsa doldurulur. Gün "kapalı" = satır var VE reopened_at IS NULL.
  reopened_at TEXT,
  reopen_reason TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('business_name', 'Dükkânım'),
  ('allow_negative_stock', 'false'),
  ('cashier_can_discount', 'false'),
  ('scanner_max_interval_ms', '50'),
  ('scanner_min_length', '6'),
  ('scanner_dup_window_ms', '80'),
  ('sound_enabled', 'true'),
  ('opening_cash_kurus', '0'),
  ('label_cols', '3'),
  ('label_rows', '8'),
  ('internal_barcode_seq', '0');
