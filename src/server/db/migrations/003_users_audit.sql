-- 003: Kullanıcı hesapları (yönetici: kullanıcı adı + şifre; kasiyer: ad + PIN) ve işlem geçmişi.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'cashier')),
  name TEXT NOT NULL,
  username TEXT COLLATE NOCASE UNIQUE,          -- yönetici için zorunlu
  password_hash TEXT,                            -- yönetici (scrypt)
  pin_hash TEXT,                                 -- kasiyer (scrypt)
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  session_version INTEGER NOT NULL DEFAULT 1,    -- şifre/PIN değişince artar → eski oturumlar geçersiz
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((role = 'owner' AND username IS NOT NULL AND password_hash IS NOT NULL)
      OR (role = 'cashier' AND pin_hash IS NOT NULL))
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,
  role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  summary TEXT NOT NULL,
  details_json TEXT
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_action ON audit_log(action);

-- Satışı kimin yaptığı
ALTER TABLE sales ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE sales ADD COLUMN user_name TEXT;
