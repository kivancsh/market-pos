-- Yazar kasa (ÖKC) entegrasyonu: her satışın yazar kasadaki yasal fişinin durumu.
-- Satış (sales) satırı programda hemen oluşur; yasal fiş yazar kasada basılınca bu kayıt 'printed' olur.
-- Yazar kasa fişi kesmezse satış otomatik iptal edilir (stok geri eklenir) ve kayıt 'cancelled' olur.
CREATE TABLE okc_documents (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id),
  provider TEXT NOT NULL CHECK (provider IN ('simulator', 'hugin_cloud', 'pavo_rest')),
  -- Yazar kasaya gönderilen sipariş numarası (ör. MK-125)
  order_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'printed', 'failed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  printed_at TEXT,
  -- Yazar kasanın verdiği mali fiş bilgileri (cihazdan gelirse)
  document_no TEXT,
  z_no TEXT,
  confirmation_code TEXT,
  error_code TEXT,
  error_message TEXT,
  -- Cihazdan gelen ham sonuç (denetim için)
  result_json TEXT
);
CREATE INDEX idx_okc_documents_status ON okc_documents(status);

-- Gün sonunda yazar kasanın Z raporu toplamı (programın cirosuyla karşılaştırılır: veri sağlığı)
ALTER TABLE day_closings ADD COLUMN okc_z_total_kurus INTEGER;
