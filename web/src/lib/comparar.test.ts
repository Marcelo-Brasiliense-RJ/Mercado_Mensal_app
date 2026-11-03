import { describe, expect, it } from "vitest";
import { linha, produtoCasa, resumo, vezes } from "./comparar";

describe("mercado x carrefour com livelo", () => {
  it("casa o produto do site com o item da lista", () => {
    expect(produtoCasa("Arroz Tio João Tipo 1 5kg", "arroz")).toBe(true);
    expect(produtoCasa("Bolinho de Arroz", "arroz")).toBe(false);
    expect(produtoCasa("Café Pilão 500g", "cafés pilão")).toBe(true);
    expect(produtoCasa("Feijão Carioca Camil", "feijao preto")).toBe(false);
  });

  it("multiplica por unidade, nao por peso", () => {
    expect(vezes(3, "un")).toBe(3);
    expect(vezes(2, "kg")).toBe(1);
    expect(vezes(0, "pct")).toBe(1);
  });

  it("desconta os pontos e diz quem vence", () => {
    // 2 x R$ 10 no Carrefour, 3 pts/R$, ponto a R$ 0,03: 60 pts = R$ 1,80
    const l = linha({ nome: "café", vezes: 2, precoMercado: 9.5, precoCarrefour: 10, ptsPorReal: 3, valorPonto: 0.03 });
    expect(l).toMatchObject({ mercado: 19, carrefour: 20, pontos: 60, liquido: 18.2, vence: "carrefour", economia: 0.8 });
    const m = linha({ nome: "arroz", vezes: 1, precoMercado: 20, precoCarrefour: 25, ptsPorReal: 3, valorPonto: 0.03 });
    expect(m.vence).toBe("mercado");
  });

  it("soma so o que da para comparar", () => {
    const base = { ptsPorReal: 3, valorPonto: 0.03, vezes: 1 };
    const r = resumo([
      linha({ ...base, nome: "a", precoMercado: 10, precoCarrefour: 10 }),
      linha({ ...base, nome: "b", precoMercado: 5, precoCarrefour: 8 }),
      linha({ ...base, nome: "c", precoMercado: null, precoCarrefour: null }),
      linha({ ...base, nome: "d", precoMercado: 4, precoCarrefour: null }),
    ]);
    expect(r).toMatchObject({ comparados: 2, semPreco: 1, tudoMercado: 15, tudoCarrefour: 18, ganhaCarrefour: 1 });
    expect(r.melhorDeCada).toBe(14.1); // 9,10 + 5
  });
});
