import { describe, expect, it } from "vitest";
import { precoNoMercado, semelhanca } from "./precoMercado";
import type { Oferta } from "./ofertas";

let id = 0;
const of = (o: Partial<Oferta>): Oferta => ({
  id: ++id, mercado: "guanabara", produto: "", marca: "", tamanho: "", categoria: "Limpeza",
  preco_por: 1, preco_de: null, condicao: null, fim: null, tem_foto: false, ...o,
});
const nome = (m: string) => ({ guanabara: "Guanabara" })[m] ?? m;
const lido = "Desodorizador Sanitário Aplicador + Gel Adesivo Limppano Inspira Citrus 42g";

describe("preco no mercado", () => {
  it("semelhanca exige a primeira palavra e a maior parte do nome", () => {
    expect(semelhanca(lido, of({ produto: "Desodorizador Sanitário Inspira Citrus" }))).toBe(1);
    expect(semelhanca(lido, of({ produto: "Desodorizador Sanitário Harpic" }))).toBeLessThan(0.7);
    expect(semelhanca(lido, of({ produto: "Limpador Banheiro Inspira" }))).toBe(0); // primeira palavra diferente
  });
  it("encarte do mercado primeiro, depois o ultimo visto la", () => {
    const ofertas = [
      of({ produto: "Desodorizador Sanitário Inspira Citrus", preco_por: 7.99 }),
      of({ produto: "Desodorizador Sanitário Inspira Citrus", preco_por: 6.5, mercado: "mundial" }),
    ];
    expect(precoNoMercado(lido, null, "guanabara", ofertas, [], nome)).toMatchObject({ preco: 7.99, origem: "encarte" });
    const vistos = [{ item: "x", barcode: "7896021625642", preco: 8.49, visto_em: "2026-10-12T12:00:00Z" }];
    expect(precoNoMercado(lido, "7896021625642", "guanabara", [], vistos, nome)).toMatchObject({ preco: 8.49, origem: "visto" });
    expect(precoNoMercado(lido, null, null, ofertas, vistos, nome)).toBeNull();
  });
});
