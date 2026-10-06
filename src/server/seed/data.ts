/**
 * Örnek ürünler (dokümandaki tablo). Fiyatlar KDV dahil TL'dir; seed içinde kuruşa çevrilir.
 * `weight`: satış sıklığı (geçmiş satış üretiminde kullanılır).
 */
export interface SeedProduct {
  no: number;
  name: string;
  category: string;
  cost: string;
  price: string;
  vat: 1 | 10 | 20;
  stock: number;
  minStock: number;
  weight: number;
  /** Bir kalemde en fazla kaç adet alınır. */
  maxQty: number;
}

export const SEED_PRODUCTS: SeedProduct[] = [
  { no: 1, name: "Su 0,5 L", category: "İçecek", cost: "6,00", price: "10,00", vat: 1, stock: 120, minStock: 24, weight: 100, maxQty: 6 },
  { no: 2, name: "Maden Suyu 200 ml", category: "İçecek", cost: "7,00", price: "12,00", vat: 1, stock: 96, minStock: 24, weight: 55, maxQty: 4 },
  { no: 3, name: "Kola 1 L", category: "İçecek", cost: "32,00", price: "50,00", vat: 20, stock: 48, minStock: 12, weight: 75, maxQty: 2 },
  { no: 4, name: "Ayran 300 ml", category: "İçecek", cost: "12,00", price: "20,00", vat: 1, stock: 40, minStock: 12, weight: 65, maxQty: 3 },
  { no: 5, name: "Meyve Suyu 1 L", category: "İçecek", cost: "38,00", price: "60,00", vat: 20, stock: 30, minStock: 8, weight: 35, maxQty: 2 },
  { no: 6, name: "Enerji İçeceği 250 ml", category: "İçecek", cost: "40,00", price: "65,00", vat: 20, stock: 24, minStock: 6, weight: 28, maxQty: 2 },
  { no: 7, name: "Cips Büyük Boy", category: "Atıştırmalık", cost: "45,00", price: "70,00", vat: 10, stock: 30, minStock: 8, weight: 45, maxQty: 2 },
  { no: 8, name: "Çikolatalı Gofret", category: "Atıştırmalık", cost: "12,00", price: "20,00", vat: 10, stock: 80, minStock: 20, weight: 80, maxQty: 4 },
  { no: 9, name: "Bisküvi", category: "Atıştırmalık", cost: "18,00", price: "30,00", vat: 10, stock: 50, minStock: 12, weight: 45, maxQty: 3 },
  { no: 10, name: "Karışık Kuruyemiş 150 g", category: "Atıştırmalık", cost: "85,00", price: "130,00", vat: 1, stock: 20, minStock: 5, weight: 15, maxQty: 1 },
  { no: 11, name: "Süt 1 L", category: "Süt Ürünleri", cost: "32,00", price: "45,00", vat: 1, stock: 36, minStock: 12, weight: 65, maxQty: 2 },
  { no: 12, name: "Yoğurt 1 kg", category: "Süt Ürünleri", cost: "60,00", price: "85,00", vat: 1, stock: 20, minStock: 6, weight: 35, maxQty: 1 },
  { no: 13, name: "Beyaz Peynir 500 g", category: "Süt Ürünleri", cost: "160,00", price: "230,00", vat: 1, stock: 15, minStock: 5, weight: 15, maxQty: 1 },
  { no: 14, name: "Yumurta 10'lu", category: "Süt Ürünleri", cost: "65,00", price: "95,00", vat: 1, stock: 25, minStock: 6, weight: 35, maxQty: 1 },
  { no: 15, name: "Makarna 500 g", category: "Temel Gıda", cost: "22,00", price: "35,00", vat: 1, stock: 60, minStock: 15, weight: 35, maxQty: 3 },
  { no: 16, name: "Pirinç 1 kg", category: "Temel Gıda", cost: "65,00", price: "95,00", vat: 1, stock: 30, minStock: 8, weight: 15, maxQty: 1 },
  { no: 17, name: "Ayçiçek Yağı 1 L", category: "Temel Gıda", cost: "75,00", price: "110,00", vat: 1, stock: 24, minStock: 6, weight: 15, maxQty: 1 },
  { no: 18, name: "Toz Şeker 1 kg", category: "Temel Gıda", cost: "38,00", price: "55,00", vat: 1, stock: 30, minStock: 8, weight: 15, maxQty: 1 },
  { no: 19, name: "Çay 1 kg", category: "Temel Gıda", cost: "240,00", price: "340,00", vat: 1, stock: 3, minStock: 4, weight: 10, maxQty: 1 },
  { no: 20, name: "Bulaşık Deterjanı 750 ml", category: "Temizlik", cost: "55,00", price: "85,00", vat: 20, stock: 18, minStock: 5, weight: 12, maxQty: 1 },
  { no: 21, name: "Çamaşır Suyu 1 L", category: "Temizlik", cost: "30,00", price: "48,00", vat: 20, stock: 20, minStock: 5, weight: 12, maxQty: 1 },
  { no: 22, name: "Tuvalet Kağıdı 12'li", category: "Temizlik", cost: "150,00", price: "220,00", vat: 20, stock: 10, minStock: 3, weight: 10, maxQty: 1 },
  { no: 23, name: "Diş Macunu", category: "Kişisel Bakım", cost: "55,00", price: "85,00", vat: 20, stock: 15, minStock: 4, weight: 10, maxQty: 1 },
  { no: 24, name: "Şampuan 500 ml", category: "Kişisel Bakım", cost: "95,00", price: "145,00", vat: 20, stock: 0, minStock: 4, weight: 8, maxQty: 1 },
  { no: 25, name: "Islak Mendil", category: "Kişisel Bakım", cost: "30,00", price: "50,00", vat: 20, stock: 40, minStock: 10, weight: 20, maxQty: 2 },
  { no: 26, name: "Tükenmez Kalem", category: "Kırtasiye", cost: "8,00", price: "15,00", vat: 20, stock: 100, minStock: 20, weight: 25, maxQty: 3 },
  { no: 27, name: "Defter A4", category: "Kırtasiye", cost: "35,00", price: "55,00", vat: 20, stock: 40, minStock: 10, weight: 12, maxQty: 2 },
];

/** Üretici barkodu eklenecek ürünler (çoklu barkod eşleşmesini test etmek için): 869 + 9 hane, kontrol basamağı seed'de hesaplanır. */
export const MANUFACTURER_BARCODE_BODIES: Record<number, string> = {
  1: "869100000001",
  3: "869100000003",
  11: "869100000011",
};

export const SUPPLIERS = ["Merkez Toptan", "Anadolu Gıda Dağıtım", "Kardeşler İçecek", "Temiz Kimya"];
