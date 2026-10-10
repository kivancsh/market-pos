-- Giderler (kâr-zarar için): kira, personel, faturalar vb. Tutar KDV dahil ödenen; net ve KDV payı tam sayı kuruşla saklanır.
-- Silinen gider kaybolmaz (deleted_at); raporlara girmez.
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  business_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'kira', 'personel', 'elektrik', 'su', 'dogalgaz', 'iletisim', 'vergi', 'muhasebe', 'bakim', 'nakliye', 'kirtasiye', 'diger'
  )),
  description TEXT,
  amount_kurus INTEGER NOT NULL CHECK (amount_kurus > 0),
  vat_rate INTEGER NOT NULL DEFAULT 0 CHECK (vat_rate IN (0, 1, 10, 20)),
  net_kurus INTEGER NOT NULL,
  vat_kurus INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_expenses_business_date ON expenses(business_date);
