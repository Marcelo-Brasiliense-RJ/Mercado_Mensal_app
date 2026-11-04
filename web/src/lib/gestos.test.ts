import { describe, expect, it } from "vitest";
import { destinoDoGesto, direcaoTroca, gestoValeu } from "./gestos";

describe("destinoDoGesto", () => {
  it("arrastar pra esquerda vai pra proxima aba", () => {
    expect(destinoDoGesto("/app/estoque", -100)).toEqual({ tipo: "aba", href: "/app/lista", dir: 1 });
  });
  it("arrastar pra direita volta uma aba", () => {
    expect(destinoDoGesto("/app/ofertas", 100)).toEqual({ tipo: "aba", href: "/app/lista", dir: -1 });
  });
  it("nas pontas nao faz nada", () => {
    expect(destinoDoGesto("/app/estoque", 100)).toBeNull();
    expect(destinoDoGesto("/app/economia", -100)).toBeNull();
  });
  it("fora das abas, pra direita volta", () => {
    expect(destinoDoGesto("/app/config", 100)).toEqual({ tipo: "voltar" });
    expect(destinoDoGesto("/app/config", -100)).toBeNull();
  });
});

describe("gestoValeu", () => {
  it("arrasto longo vale", () => expect(gestoValeu(-120, 600, 390)).toBe(true));
  it("arrasto curto e lento nao vale", () => expect(gestoValeu(-50, 500, 390)).toBe(false));
  it("peteleco rapido vale", () => expect(gestoValeu(60, 90, 390)).toBe(true));
});

describe("direcaoTroca", () => {
  it("segue a ordem das abas", () => {
    expect(direcaoTroca("/app/estoque", "/app/economia")).toBe(1);
    expect(direcaoTroca("/app/livelo", "/app/lista")).toBe(-1);
  });
  it("entrar em Ajustes vem da direita, sair volta", () => {
    expect(direcaoTroca("/app/lista", "/app/config")).toBe(1);
    expect(direcaoTroca("/app/config", "/app/lista")).toBe(-1);
  });
});
