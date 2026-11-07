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
