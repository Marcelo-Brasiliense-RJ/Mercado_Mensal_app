"use client";

import { isValidBarcode, onlyDigits } from "./barcode";

// Primeira etapa da foto: o codigo de barras pode estar nela, so torto ou pequeno para o
// leitor ao vivo. Le no proprio celular (gratis, sem IA): nativo quando existe, senao
// ZXing girando a imagem de 30 em 30 graus, como o leitor.
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "itf", "code_128"];
const ANGULOS = [0, 90, 30, 120, 60, 150];

type Detector = { detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]> };

export async function codigoNaFoto(arquivo: Blob): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const ok = (t: string) => (isValidBarcode(t) ? onlyDigits(t) : "");

  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
  if (BD) {
    try {
      for (const c of await new BD({ formats: FORMATOS }).detect(img)) if (ok(c.rawValue)) return ok(c.rawValue);
    } catch {
      // detector sem suporte a imagem: cai no ZXing
    }
  }

  const [{ BrowserMultiFormatReader }, zxing] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const hints = new Map();
  hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
    zxing.BarcodeFormat.EAN_13,
    zxing.BarcodeFormat.EAN_8,
    zxing.BarcodeFormat.UPC_A,
    zxing.BarcodeFormat.UPC_E,
    zxing.BarcodeFormat.ITF,
    zxing.BarcodeFormat.CODE_128,
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const w = Math.round(img.width * k);
  const h = Math.round(img.height * k);
  const tela = document.createElement("canvas");
  for (const a of ANGULOS) {
    const rad = (a * Math.PI) / 180;
    const cw = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
    const ch = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
    tela.width = cw;
    tela.height = ch;
    const ctx = tela.getContext("2d", { willReadFrequently: true })!;
    ctx.setTransform(1, 0, 0, 1, cw / 2, ch / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    try {
      const t = ok(reader.decodeFromCanvas(tela).getText());
      if (t) return t;
    } catch {
      // sem codigo neste angulo
    }
  }
  return "";
}
