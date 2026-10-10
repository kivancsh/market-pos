-- 004: Yönetici e-postası, kasiyer numarası, e-posta onay kodları ve günlük rapor gönderim kaydı.

-- Yöneticinin e-posta adresi (onay kodları ve günlük rapor buraya gider)
ALTER TABLE users ADD COLUMN email TEXT;

-- Kasiyerin benzersiz numarası (girişte No + PIN); 1001'den başlar
ALTER TABLE users ADD COLUMN cashier_no INTEGER;
CREATE UNIQUE INDEX idx_users_cashier_no ON users(cashier_no) WHERE cashier_no IS NOT NULL;
UPDATE users
   SET cashier_no = 1000 + (SELECT COUNT(*) FROM users u2 WHERE u2.role = 'cashier' AND u2.id <= users.id)
 WHERE role = 'cashier';

-- E-posta onay kodları (kod düz saklanmaz; HMAC özeti tutulur)
CREATE TABLE verification_codes (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,          -- tarayıcıya verilen istek kimliği (rastgele)
  purpose TEXT NOT NULL,               -- setup | forgot_password | change_secret | change_email
  user_id INTEGER REFERENCES users(id),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  payload_json TEXT,                   -- bekleyen işlem bilgisi (şifre varsa sadece hash'i)
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX idx_verification_purpose ON verification_codes(purpose, email, created_at);

-- Günlük rapor e-postası gönderim kaydı (otomatik gönderim günde bir kez)
CREATE TABLE daily_report_log (
  id INTEGER PRIMARY KEY,
  business_date TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('close', 'auto', 'manual')),
  recipients TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE INDEX idx_daily_report_date ON daily_report_log(business_date);
