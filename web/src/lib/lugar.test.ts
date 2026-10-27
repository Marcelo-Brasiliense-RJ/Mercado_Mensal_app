import { describe, expect, it } from "vitest";
import { aprender, dentroDeMercado, distancia } from "./lugar";

// Guanabara Curicica (aprox.) e pontos a ~30 m, ~80 m e ~1 km dele.
const loja = { lat: -22.9561, lng: -43.3829 };
const corredor = { lat: -22.95637, lng: -43.3829 }; // ~30 m
const estacionamento = { lat: -22.95682, lng: -43.3829 }; // ~80 m
const casa = { lat: -22.9651, lng: -43.3829 }; // ~1 km

describe("lugar", () => {
  it("distancia em metros", () => {
    expect(distancia(loja, corredor)).toBeGreaterThan(25);
    expect(distancia(loja, corredor)).toBeLessThan(35);
    expect(distancia(loja, casa)).toBeGreaterThan(950);
  });
  it("dentro so perto do ponto e com GPS preciso", () => {
    const pontos = aprender([], { ...loja, precisao: 12 }, 1);
    expect(dentroDeMercado({ ...corredor, precisao: 15 }, pontos)).toBe(true);
    expect(dentroDeMercado({ ...estacionamento, precisao: 15 }, pontos)).toBe(false);
    expect(dentroDeMercado({ ...corredor, precisao: 120 }, pontos)).toBe(false); // GPS ruim nao decide
    expect(dentroDeMercado({ ...casa, precisao: 8 }, pontos)).toBe(false);
  });
  it("aprende: mesma loja vira um ponto so; GPS ruim nao entra", () => {
    let p = aprender([], { ...loja, precisao: 10 }, 1);
    p = aprender(p, { ...corredor, precisao: 10 }, 2);
    expect(p).toHaveLength(1);
    expect(p[0].n).toBe(2);
    p = aprender(p, { ...casa, precisao: 10 }, 3);
    expect(p).toHaveLength(2);
    expect(aprender(p, { ...loja, precisao: 200 }, 4)).toBe(p);
  });
});
