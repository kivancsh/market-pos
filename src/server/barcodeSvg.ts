import bwipjs from "bwip-js/node";
import { isValidEan13, isValidEan8 } from "@/lib/barcode";

/**
 * Barkod görseli (SVG metni). Türüne göre EAN-13 / EAN-8 / UPC-A, diğerleri Code128.
 * EAN/UPC'de kenar boşlukları (quiet zone) `guardwhitespace` ile eklenir; numara altta yazılır.
 */
export function barcodeSvg(code: string): string {
  let bcid = "code128";
  if (/^\d{13}$/.test(code) && isValidEan13(code)) bcid = "ean13";
  else if (/^\d{8}$/.test(code) && isValidEan8(code)) bcid = "ean8";
  else if (/^\d{12}$/.test(code) && isValidEan13("0" + code)) bcid = "upca";
  const isGs1 = bcid !== "code128";
  return bwipjs.toSVG({
    bcid,
    text: code,
    scale: 2,
    height: 14,
    includetext: true,
    textxalign: "center",
    ...(isGs1 ? { guardwhitespace: true } : { paddingwidth: 10 }),
  });
}
