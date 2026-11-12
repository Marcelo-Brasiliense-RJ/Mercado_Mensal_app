import { describe, expect, it } from "vitest";
import { MUDOU_DE_PARTE, medir, mudanca, veredito } from "./quadroCupom";

// quadro sintetico 60x80: papel branco com "linhas de texto" pretas
function cupom(w = 60, h = 80, fundo = 230, tinta = 20, borrado = false) {
  const a = new Array(w * h).fill(fundo);
  for (let y = 4; y < h - 4; y += 4) for (let x = 6; x < w - 6; x++) if ((x + y) % 7 < 4) a[y * w + x] = tinta;
  if (!borrado) return a;
  const b = a.slice();
  for (let i = w; i < a.length - w; i++) b[i] = (a[i - 1] + a[i] + a[i + 1] + a[i - w] + a[i + w]) / 5;
  return b;
}

describe("camera da nota: da para ler?", () => {
  it("cupom nitido e claro = bom", () => {
    const m = medir(cupom(), 60, 80);
    expect(veredito(m, m.nitidez)).toBe("bom");
  });
  it("escuro pede luz", () => {
    expect(veredito(medir(cupom(60, 80, 40, 10), 60, 80), 0)).toBe("luz");
  });
  it("mesa escura com pouco papel pede chegar perto", () => {
    const a = new Array(60 * 80).fill(90);
    for (let y = 30; y < 45; y++) for (let x = 25; x < 35; x++) a[y * 60 + x] = 230;
    expect(veredito(medir(a, 60, 80), 0)).toBe("perto");
  });
  it("borrado perde para o melhor ja visto", () => {
    const bom = medir(cupom(), 60, 80);
    const ruim = medir(cupom(60, 80, 230, 20, true), 60, 80);
    expect(ruim.nitidez).toBeLessThan(bom.nitidez);
    expect(veredito(ruim, bom.nitidez)).toBe("foco");
  });
  it("mao mexendo pede firmeza", () => {
    const a = cupom();
    const b = a.map((v, i) => (i % 2 ? 255 - v : v));
    expect(veredito(medir(b, 60, 80, a), 0)).toBe("firme");
  });
});

describe("camera da nota: so tira de novo depois de descer", () => {
  it("parado no mesmo lugar nao libera outra foto", () => {
    const a = cupom();
    const tremido = a.map((v, i) => (i % 5 === 0 ? Math.min(255, v + 15) : v));
    expect(mudanca(tremido, a)).toBeLessThan(MUDOU_DE_PARTE);
  });
  it("outra parte do cupom libera", () => {
    const a = cupom();
    const desceu = a.map((_, i) => a[(i + 60 * 2) % a.length]); // linhas deslocadas meia linha
    expect(mudanca(desceu, a)).toBeGreaterThan(MUDOU_DE_PARTE);
  });
  it("sem foto anterior libera", () => {
    expect(mudanca(cupom(), null)).toBe(Infinity);
  });
});
