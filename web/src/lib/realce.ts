// Realce automatico da foto ANTES de ir para a IA (parte pura, testada).
// Foto de armario/carrinho costuma vir escura ou "lavada": o rotulo fica sem contraste e
// a IA larga o produto ou chuta pelo formato. Aqui sai uma curva (LUT de 256 tons) que
// estica o contraste e clareia as sombras, so quando precisa: foto boa fica igual.

// hist: quantos pixels em cada tom de cinza (0..255). Devolve a curva ou null (nao mexe).
export function curvaDeRealce(hist: ArrayLike<number>): Uint8Array | null {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i] ?? 0;
  if (total < 100) return null;
  const tom = (frac: number) => {
    let soma = 0;
    for (let i = 0; i < 256; i++) {
      soma += hist[i] ?? 0;
      if (soma >= total * frac) return i;
    }
    return 255;
  };
  let lo = tom(0.005);
  let hi = tom(0.995);
  if (hi - lo < 24) return null; // foto chapada (parede, preto): esticar so aumenta ruido
  // Ganho no maximo 2,2x: mais que isso estoura o granulado da foto escura.
  const ganhoMax = 2.2;
  if ((255 / (hi - lo)) > ganhoMax) {
    const meio = (lo + hi) / 2;
    const meia = 255 / ganhoMax / 2;
    lo = Math.max(0, meio - meia);
    hi = Math.min(255, meio + meia);
  }
  // Escura (meio da foto abaixo de ~35% depois de esticar): gama clareia as sombras sem
  // estourar o claro. Limite 0,6 para nao virar foto "lavada".
  const mediana = Math.min(1, Math.max(0, (tom(0.5) - lo) / (hi - lo || 1)));
  const gama = mediana > 0 && mediana < 0.35 ? Math.max(0.6, Math.log(0.42) / Math.log(mediana)) : 1;
  const lut = new Uint8Array(256);
  let desvio = 0;
  for (let i = 0; i < 256; i++) {
    const t = Math.min(1, Math.max(0, (i - lo) / (hi - lo || 1)));
    lut[i] = Math.round(255 * Math.pow(t, gama));
    desvio = Math.max(desvio, Math.abs(lut[i] - i));
  }
  return desvio < 8 ? null : lut; // quase igual: nem gasta tempo aplicando
}

// Histograma de cinza dos pixels RGBA (pula pixels: amostra basta e e rapido no celular).
export function histograma(px: Uint8ClampedArray, passo = 4): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4 * passo) h[(px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8]++;
  return h;
}

// Aplica a mesma curva nos tres canais (mantem a cor do rotulo).
export function aplicarCurva(px: Uint8ClampedArray, lut: Uint8Array): void {
  for (let i = 0; i < px.length; i += 4) {
    px[i] = lut[px[i]];
    px[i + 1] = lut[px[i + 1]];
    px[i + 2] = lut[px[i + 2]];
  }
}

// ---- foto borrada (tremida/desfocada) ----
// Nitidez do cinza: variancia do laplaciano numa amostra reduzida. Borrada = numero baixo.
export function nitidezDe(px: Uint8ClampedArray, w: number, h: number): number {
  const passo = Math.max(1, Math.floor(Math.max(w, h) / 400)); // ~400 px no lado maior
  const W = Math.floor(w / passo), H = Math.floor(h / passo);
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * passo * w + x * passo) * 4;
      g[y * W + x] = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    }
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      const l = g[k - 1] + g[k + 1] + g[k - W] + g[k + W] - 4 * g[k];
      s += l; s2 += l * l; n++;
    }
  return n ? s2 / n - (s / n) ** 2 : 0;
}

// Mascara de nitidez (unsharp 3x3): realca a borda da letra do rotulo.
export function afiar(px: Uint8ClampedArray, w: number, h: number, forca = 0.8): void {
  const o = new Uint8ClampedArray(px);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const m = (o[i - 4 + c] + o[i + 4 + c] + o[i - w * 4 + c] + o[i + w * 4 + c] + o[i + c]) / 5;
        px[i + c] = o[i + c] + forca * (o[i + c] - m);
      }
    }
}
