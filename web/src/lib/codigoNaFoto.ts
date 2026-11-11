"use client";

import { isValidBarcode, onlyDigits } from "./barcode";
import { criarLeitor, PASSOS } from "./leituraCodigo";
import { obterDetector } from "./detector";

// Primeira etapa da foto: o codigo de barras pode estar nela, so torto ou pequeno para o
// leitor ao vivo. Le no proprio celular (gratis, sem IA): nativo ou WebAssembly, senao
// ZXing com os mesmos giros e realces do leitor (lib/leituraCodigo).
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "itf", "code_128"];

export async function codigoNaFoto(arquivo: Blob): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const ok = (t: string) => (isValidBarcode(t) ? onlyDigits(t) : "");

  // Leitor do sistema ou zxing-cpp em WebAssembly (lib/detector), depois o ZXing JS.
  try {
    const { detector } = await obterDetector(FORMATOS);
    for (const c of await detector.detect(img)) if (ok(c.rawValue)) return ok(c.rawValue);
  } catch {
    // sem leitor: cai no ZXing
  }

  // Foto parada: da para tentar tudo (angulos e realces contra reflexo).
  const ler = await criarLeitor();
  for (const p of PASSOS) {
    const t = ok(ler(img, img.width, img.height, p));
    if (t) return t;
  }
  return "";
}
