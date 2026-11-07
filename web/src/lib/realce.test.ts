import { describe, expect, it } from "vitest";
import { aplicarCurva, curvaDeRealce, histograma } from "./realce";

// histograma com pixels espalhados por igual entre a e b
const faixa = (a: number, b: number) => {
  const h = new Array(256).fill(0);
  for (let i = a; i <= b; i++) h[i] = 100;
  return h;
};

describe("realce da foto", () => {
  it("foto boa fica igual", () => {
    expect(curvaDeRealce(faixa(0, 255))).toBeNull();
  });

  it("foto escura clareia e ganha contraste", () => {
    const lut = curvaDeRealce(faixa(10, 120))!;
    expect(lut).not.toBeNull();
    expect(lut[10]).toBeLessThan(10);
    expect(lut[120]).toBeGreaterThan(200);
    expect(lut[40]).toBeGreaterThan(40); // sombra clareou
    for (let i = 1; i < 256; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]); // nunca inverte tom
  });

  it("foto lavada (sem contraste) estica, com ganho limitado", () => {
    const lut = curvaDeRealce(faixa(90, 170))!;
    expect(lut[90]).toBeLessThan(50);
    expect(lut[170]).toBeGreaterThan(205);
    const lutRuim = curvaDeRealce(faixa(120, 160))!; // muito chapada: no maximo 2,2x
    expect(lutRuim[160] - lutRuim[120]).toBeLessThanOrEqual(Math.ceil(40 * 2.2) + 1);
  });

  it("chapada demais (parede) e foto vazia nao mexem", () => {
    expect(curvaDeRealce(faixa(100, 110))).toBeNull();
    expect(curvaDeRealce(new Array(256).fill(0))).toBeNull();
  });

  it("aplica a curva nos 3 canais e conta o histograma", () => {
    const px = new Uint8ClampedArray([10, 20, 30, 255, 200, 200, 200, 255]);
    const h = histograma(px, 1);
    expect(h.reduce((s, n) => s + n, 0)).toBe(2);
    const lut = new Uint8Array(256).map((_, i) => 255 - i);
    aplicarCurva(px, lut);
    expect(Array.from(px)).toEqual([245, 235, 225, 255, 55, 55, 55, 255]);
  });
});

describe("foto borrada", () => {
  // xadrez nitido x o mesmo xadrez borrado (media 3x3)
  const xadrez = (w: number, h: number) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = ((x >> 2) + (y >> 2)) % 2 ? 230 : 20; px.set([v, v, v, 255], (y * w + x) * 4); }
    return px;
  };
  it("nitida mede bem mais que borrada, e afiar devolve nitidez", async () => {
    const { nitidezDe, afiar } = await import("./realce");
    const w = 120, h = 80, nitida = xadrez(w, h);
    const borrada = new Uint8ClampedArray(nitida);
    for (let k = 0; k < 3; k++) {
      const o = new Uint8ClampedArray(borrada);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) for (let c = 0; c < 3; c++) {
        let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += o[((y + dy) * w + x + dx) * 4 + c];
        borrada[(y * w + x) * 4 + c] = s / 9;
      }
    }
    const a = nitidezDe(nitida, w, h), b = nitidezDe(borrada, w, h);
    expect(b).toBeLessThan(a / 3);
    afiar(borrada, w, h);
    expect(nitidezDe(borrada, w, h)).toBeGreaterThan(b);
  });
});
