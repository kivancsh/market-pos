import { describe, expect, it } from "vitest";
import { ScannerDetector, type ScanDecision } from "@/client/scannerDetector";

const CONFIG = { maxIntervalMs: 50, minLength: 6, dupWindowMs: 80 };

/** Metni verilen aralıklarla "yazar", sonuna Enter basar; Enter kararını döndürür. */
function type(d: ScannerDetector, text: string, start: number, gap: number, enterGap = gap): { result: ScanDecision; end: number } {
  let t = start;
  for (const ch of text) {
    d.feed({ key: ch, time: t });
    t += gap;
  }
  t += enterGap - gap;
  return { result: d.feed({ key: "Enter", time: t }), end: t };
}

describe("ScannerDetector", () => {
  it("hızlı yazılan 13 hane + Enter barkod sayılır", () => {
    const d = new ScannerDetector(CONFIG);
    expect(type(d, "2000000000015", 0, 8).result).toEqual({ type: "scan", code: "2000000000015" });
  });

  it("insan hızında yazım barkod sayılmaz (elle giriş yolu kullanılır)", () => {
    const d = new ScannerDetector(CONFIG);
    expect(type(d, "2000000000015", 0, 150).result).toEqual({ type: "none" });
  });

  it("6 karakterden kısa hızlı dizi barkod sayılmaz", () => {
    const d = new ScannerDetector(CONFIG);
    expect(type(d, "12345", 0, 5).result).toEqual({ type: "none" });
    expect(type(d, "123456", 1000, 5).result).toEqual({ type: "scan", code: "123456" });
  });

  it("eşik tam sınırda: 50 ms kabul, 51 ms reddedilir", () => {
    expect(type(new ScannerDetector(CONFIG), "1234567", 0, 50).result.type).toBe("scan");
    expect(type(new ScannerDetector(CONFIG), "1234567", 0, 51).result.type).toBe("none");
  });

  it("yavaş başlangıçtan sonra gelen hızlı dizi yine yakalanır (önceki tuşlar atılır)", () => {
    const d = new ScannerDetector(CONFIG);
    d.feed({ key: "a", time: 0 });
    d.feed({ key: "b", time: 300 });
    expect(type(d, "8690000000005", 1000, 6).result).toEqual({ type: "scan", code: "8690000000005" });
  });

  it("aynı barkodun normal aralıkla tekrar okutulması meşrudur", () => {
    const d = new ScannerDetector(CONFIG);
    const a = type(d, "2000000000015", 0, 5);
    const b = type(d, "2000000000015", a.end + 400, 5);
    expect(a.result.type).toBe("scan");
    expect(b.result.type).toBe("scan");
  });

  it("80 ms'den kısa sürede gelen birebir aynı okuma çift tetikleme sayılır", () => {
    const d = new ScannerDetector(CONFIG);
    const a = type(d, "2000000000015", 0, 5);
    const b = type(d, "2000000000015", a.end + 10, 5);
    expect(b.result).toEqual({ type: "duplicate", code: "2000000000015" });
    // farklı barkod hemen ardından gelse bile sayılır
    const c = type(d, "2000000000022", b.end + 10, 5);
    expect(c.result.type).toBe("scan");
  });

  it("Shift (büyük harf) diziyi bozmaz; Backspace ve Ctrl kısayolları sıfırlar", () => {
    const d = new ScannerDetector(CONFIG);
    let t = 0;
    for (const k of ["Shift", "A", "B", "Shift", "C", "1", "2", "3"]) d.feed({ key: k, time: (t += 5) });
    expect(d.feed({ key: "Enter", time: (t += 5) })).toEqual({ type: "scan", code: "ABC123" });

    for (const ch of "123") d.feed({ key: ch, time: (t += 5) });
    d.feed({ key: "Backspace", time: (t += 5) });
    for (const ch of "456") d.feed({ key: ch, time: (t += 5) });
    expect(d.feed({ key: "Enter", time: (t += 5) }).type).toBe("none");

    for (const ch of "123456") d.feed({ key: ch, time: (t += 5), ctrlKey: ch === "4" });
    expect(d.feed({ key: "Enter", time: (t += 5) }).type).toBe("none");
  });

  it("Enter çok geç gelirse barkod sayılmaz", () => {
    const d = new ScannerDetector(CONFIG);
    expect(type(d, "2000000000015", 0, 5, 400).result.type).toBe("none");
  });

  it("eşikler ayarlardan değiştirilebilir", () => {
    const d = new ScannerDetector(CONFIG);
    d.setConfig({ maxIntervalMs: 120, minLength: 4, dupWindowMs: 80 });
    expect(type(d, "1234", 0, 100).result.type).toBe("scan");
  });
});
