"use client";

// Leitura de codigo de barras com ZXing, compartilhada pelo leitor ao vivo e pela foto.
//
// Por que existe: no mercado a luz e forte e a embalagem brilha. O reflexo apaga parte
// das barras (visto num Aperol: metade do codigo virou branco) e o ZXing puro desiste.
// O "realce" compara cada pixel com a media da vizinhanca: o reflexo, que e uma mancha
// larga, some, e a barra fraca volta a ficar escura. Testado com fotos reais do app
// (Aperol com reflexo, fermento Royal na mao): sem realce nenhuma lia, com realce as duas.
//
// O ZXing tambem so le na horizontal: cada tentativa gira a imagem num angulo. As
// tentativas se revezam quadro a quadro, entao uma volta inteira leva ~1 s.

type Passo = { rot: number; realce?: "centro" | "todo" };

// Deitado e em pe primeiro (como quase todo mundo segura); o realce no meio do caminho.
export const PASSOS: Passo[] = [
  { rot: 0 },
  { rot: 0, realce: "centro" },
  { rot: 90 },
  { rot: 0, realce: "todo" },
  { rot: 30 },
  { rot: 90, realce: "centro" },
  { rot: 120 },
  { rot: 60 },
  { rot: 150 },
];

// Cinza pelo menor canal (barra colorida em fundo branco fica escura) e realce local:
// 128 + (pixel - media da vizinhanca) x ganho. Media por imagem integral: O(pixels).
function realcar(ctx: CanvasRenderingContext2D, w: number, h: number, raio: number, ganho: number) {
  const d = ctx.getImageData(0, 0, w, h);
  const p = d.data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = Math.min(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]);
  const W = w + 1;
  const I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) {
      s += g[y * w + x];
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + s;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - raio);
    const y1 = Math.min(h, y + raio + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - raio);
      const x1 = Math.min(w, x + raio + 1);
      const m = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      let v = 128 + (g[y * w + x] - m) * ganho;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      const j = (y * w + x) * 4;
      p[j] = p[j + 1] = p[j + 2] = v;
    }
  }
  ctx.putImageData(d, 0, 0);
}

export async function criarLeitor() {
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
  const tela = document.createElement("canvas");

  // Uma tentativa: recorta (centro = 70% do meio, onde fica a mira), reduz, gira, realca.
  return function ler(fonte: CanvasImageSource, largura: number, altura: number, passo: Passo): string {
    const frac = passo.realce === "centro" ? 0.7 : 1;
    const cw = largura * frac;
    const ch = altura * frac;
    // realce em JS pesa: imagem menor (o recorte do centro ja aproxima o codigo)
    const k = Math.min(1, (passo.realce ? 1100 : 1600) / Math.max(cw, ch));
    const w = Math.round(cw * k);
    const h = Math.round(ch * k);
    const rad = (passo.rot * Math.PI) / 180;
    const tw = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
    const th = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
    tela.width = tw;
    tela.height = th;
    const ctx = tela.getContext("2d", { willReadFrequently: true })!;
    ctx.setTransform(1, 0, 0, 1, tw / 2, th / 2);
    ctx.rotate(rad);
    ctx.drawImage(fonte, (largura - cw) / 2, (altura - ch) / 2, cw, ch, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (passo.realce) realcar(ctx, tw, th, passo.realce === "centro" ? 16 : 32, passo.realce === "centro" ? 8 : 4);
    try {
      return reader.decodeFromCanvas(tela).getText();
    } catch {
      return ""; // sem codigo nesta tentativa
    }
  };
}
