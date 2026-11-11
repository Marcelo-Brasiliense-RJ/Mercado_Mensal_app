"use client";

// Leitor de codigo de barras "nativo" em todo aparelho.
//
// Por que existe: o Chrome do Android tem BarcodeDetector (leitor do sistema, rapido);
// o Safari do iPhone NAO tem, e la o app decodificava em JavaScript (ZXing JS), lento
// e fraco com codigo pequeno, torto ou com reflexo: o "demora muito para ler" do dono.
// Sem o nativo, entra o zxing-cpp compilado em WebAssembly (pacote barcode-detector),
// com a MESMA interface do nativo. O .wasm (~1 MB) e servido pelo proprio app
// (/zxing_reader.wasm, copiado no build) e so baixa quando o leitor abre.
export type Detector = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type Construtor = new (o: { formats: string[] }) => Detector;

let poly: Promise<Construtor> | null = null;

function polyfill(): Promise<Construtor> {
  poly ??= import("barcode-detector/ponyfill").then((m) => {
    m.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing_reader.wasm" : prefix + path),
      },
      fireImmediately: true,
    });
    return m.BarcodeDetector as unknown as Construtor;
  });
  return poly;
}

export async function obterDetector(formatos: string[]): Promise<{ detector: Detector; nativo: boolean }> {
  const BD = (globalThis as unknown as { BarcodeDetector?: Construtor }).BarcodeDetector;
  if (BD) {
    try {
      return { detector: new BD({ formats: formatos }), nativo: true };
    } catch {
      /* formato sem suporte no nativo: vai o WebAssembly */
    }
  }
  const P = await polyfill();
  return { detector: new P({ formats: formatos }), nativo: false };
}
