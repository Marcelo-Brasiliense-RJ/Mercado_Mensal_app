import { describe, expect, it } from "vitest";
import { medir, recorteNoVideo, veredito } from "./quadroCupom";

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

describe("camera da nota: fim da parte anterior = o que estava na moldura", () => {
  it("video 1080x1920 cobrindo tela 390x844: moldura do meio vira o trecho certo do video", () => {
    // escala = max(390/1080, 844/1920) = 0.4396; video na tela 474.8 x 844, sobra 42.4 de cada lado
    const r = recorteNoVideo(1080, 1920, { x: 0, y: 0, w: 390, h: 844 }, { x: 30, y: 200, w: 330, h: 440 });
    expect(r.x).toBeCloseTo((30 + 42.4) / 0.4396, 0);
    expect(r.y).toBeCloseTo(200 / 0.4396, 0);
    expect(r.w).toBeCloseTo(330 / 0.4396, 0);
    expect(r.h).toBeCloseTo(440 / 0.4396, 0);
  });
  it("nao sai do video", () => {
    const r = recorteNoVideo(100, 100, { x: 0, y: 0, w: 100, h: 100 }, { x: -10, y: 90, w: 50, h: 50 });
    expect(r.x).toBe(0);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });
});
