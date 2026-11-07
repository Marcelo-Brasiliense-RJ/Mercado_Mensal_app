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
