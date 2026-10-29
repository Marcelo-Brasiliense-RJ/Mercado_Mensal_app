"use client";

import { isValidBarcode, onlyDigits } from "./barcode";
import { criarLeitor, PASSOS } from "./leituraCodigo";

// Primeira etapa da foto: o codigo de barras pode estar nela, so torto ou pequeno para o
// leitor ao vivo. Le no proprio celular (gratis, sem IA): nativo quando existe, senao
// ZXing com os mesmos giros e realces do leitor (lib/leituraCodigo).
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "itf", "code_128"];

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

  // Foto parada: da para tentar tudo (angulos e realces contra reflexo).
  const ler = await criarLeitor();
  for (const p of PASSOS) {
    const t = ok(ler(img, img.width, img.height, p));
    if (t) return t;
  }
  return "";
}
