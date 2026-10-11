-- Yapay zekâ asistanı: aylık rapor (yerel analiz + Claude yorumu), aylık hedefler ve aksiyon takibi.

-- Ay başına bir rapor. Ay bitmeden oluşturulan "ara rapor" (is_partial=1) ay bitince son hâliyle değiştirilir.
CREATE TABLE monthly_reports (
  month TEXT PRIMARY KEY,                -- 'YYYY-MM'
  period_to TEXT NOT NULL,               -- analiz edilen son iş günü
  is_partial INTEGER NOT NULL DEFAULT 0 CHECK (is_partial IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  facts_json TEXT NOT NULL,              -- yerel analiz (bütün rakamlar buradan)
  ai_json TEXT,                          -- Claude yorumu (yapılandırılmış)
  ai_model TEXT,
  ai_generated_at TEXT,
  ai_error TEXT,
  ai_attempts INTEGER NOT NULL DEFAULT 0,
  ai_last_attempt_at TEXT,
  emailed_at TEXT
);

-- Aylık hedefler. Değerler: para = kuruş, marj = binde, adet = sayı. source: otomatik öneri ya da yöneticinin girdiği.
CREATE TABLE monthly_targets (
  month TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('revenue', 'gross_profit', 'net_profit', 'margin', 'avg_basket', 'sale_count', 'expenses')),
  target INTEGER NOT NULL,
  baseline INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('auto', 'owner')),
  rationale TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (month, metric)
);

-- Raporda önerilen aksiyonların durumu (yönetici işaretler; sonraki ayın raporu etkisini değerlendirir).
CREATE TABLE monthly_action_status (
  month TEXT NOT NULL,                   -- raporun ayı
  action_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'done', 'skipped')),
  title TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (month, action_key)
);
