// Camera do app para a nota: mede, a cada quadro, se da para ler. Parte pura (testavel),
// usada por components/receipt/CameraCupom.tsx num quadro reduzido em tons de cinza.
//
// - brilho: media 0..255. Escuro demais nao le; estourado (flash/sol) tambem nao.
// - papel: fracao de pixels claros no centro. Cupom e papel branco: pouco branco = longe
//   demais (ou fora do quadro).
// - nitidez: variancia do Laplaciano (borda das letras). Borrado/fora de foco = baixa.
// - movimento: diferenca media para o quadro anterior. Mao mexendo = alta.

export type Medida = { brilho: number; papel: number; nitidez: number; movimento: number };
export type Veredito = "bom" | "perto" | "luz" | "estourado" | "firme" | "foco";

export function medir(cinza: ArrayLike<number>, w: number, h: number, anterior?: ArrayLike<number>): Medida {
  let soma = 0;
  let claros = 0;
  let centro = 0;
  const x0 = Math.floor(w * 0.15), x1 = Math.ceil(w * 0.85), y0 = Math.floor(h * 0.1), y1 = Math.ceil(h * 0.9);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = cinza[y * w + x];
      soma += v;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        centro++;
        if (v > 150) claros++;
      }
    }
  // Laplaciano 4-vizinhos
  let n = 0, m = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * cinza[i] - cinza[i - 1] - cinza[i + 1] - cinza[i - w] - cinza[i + w];
      n++;
      m += l;
      m2 += l * l;
    }
  const media = n ? m / n : 0;
  let mov = 0;
  if (anterior && anterior.length === cinza.length) {
    let d = 0;
    for (let i = 0; i < cinza.length; i += 3) d += Math.abs(cinza[i] - anterior[i]);
    mov = d / Math.ceil(cinza.length / 3);
  }
  return { brilho: soma / (w * h), papel: centro ? claros / centro : 0, nitidez: n ? m2 / n - media * media : 0, movimento: mov };
}

// O que dizer agora. `melhor`: a maior nitidez vista nesta sessao (cada celular e cupom
// tem uma escala; o bom e chegar perto do melhor ja visto, com um piso).
export function veredito(m: Medida, melhor: number): Veredito {
  if (m.brilho < 60) return "luz";
  if (m.brilho > 235) return "estourado";
  if (m.papel < 0.35) return "perto";
  // Celular na mao treme e o iPhone reajusta a exposicao o tempo todo: 12 travava em
  // "segure firme" com o cupom perfeito na tela (print do dono). So movimento de verdade.
  if (m.movimento > 30) return "firme";
  if (m.nitidez < Math.max(150, melhor * 0.6)) return "foco";
  return "bom";
}

export const DICA: Record<Veredito, string> = {
  bom: "✓ Bom! Segure assim…",
  perto: "Chegue mais perto: o cupom tem que encher a moldura",
  luz: "💡 Está escuro: procure mais luz",
  estourado: "Muito reflexo: incline um pouco o celular",
  firme: "✋ Segure firme",
  foco: "Toque no cupom na tela para focar, ou afaste um pouquinho",
};
