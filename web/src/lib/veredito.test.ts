import { describe, expect, it } from "vitest";
import { precoNoMercado, termosDe, veredito } from "./veredito";
import type { Oferta } from "./ofertas";

const oferta = (produto: string, preco: number, mercado = "guanabara"): Oferta => ({
  id: 1, mercado, produto, marca: "", tamanho: "", categoria: "", preco_por: preco, preco_de: null, condicao: null, fim: null, tem_foto: false,
});

describe("livelo ou mercado", () => {
  it("mesmo preco: a Livelo ganha pelos pontos", () => {
    expect(veredito(10, 30, 0.03, 10)).toEqual({ tipo: "livelo", economia: 0.9, valorPts: 0.9 });
  });
  it("mercado bem mais barato ganha mesmo com pontos", () => {
    expect(veredito(13.09, 39, 0.03, 9.99)).toMatchObject({ tipo: "mercado", diferenca: 1.93 });
  });
  it("sem preco do mercado", () => expect(veredito(10, 30, 0.03, null).tipo).toBe("sem"));

  it("termos do mais certeiro ao mais solto", () => {
    expect(termosDe("Limpador Sanitário Pato Cloro Gel 500ml", null)).toEqual(["limpador sanitario", "limpador"]);
    expect(termosDe("Arroz Tio João 5kg", "arroz")).toEqual(["arroz", "arroz tio"]);
  });
  it("preco do mercado: encarte, senao lista, senao ultimo pago", () => {
    const enc = precoNoMercado("Arroz Tio João 5kg", "arroz", [oferta("Arroz Camil", 22), oferta("Arroz X", 1, "carrefour")], [], []);
    expect(enc).toMatchObject({ preco: 22, fonte: "encarte Guanabara" });
    const ult = precoNoMercado("Café Pilão 500g", null, [], [{ name: "café", priceLast: 18 }], []);
    expect(ult).toMatchObject({ preco: 18, fonte: "último que você pagou" });
    expect(precoNoMercado("Air Fryer", null, [], [], [])).toBeNull();
  });
});
