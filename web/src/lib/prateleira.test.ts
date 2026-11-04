import { describe, expect, it } from "vitest";
import { agrupar, corDe, daMemoria, iou, limpar, mesmoProduto, type Achado } from "./prateleira";

const a = (box: [number, number, number, number], nome = "x", legivel = true): Achado => ({ box, nome, rotulo: "", legivel });

describe("quadrados da prateleira", () => {
  it("descarta fora, minusculo, gigante e repetido", () => {
    const r = limpar([
      a([0.1, 0.1, 0.3, 0.2], "cafe pilao"),
      a([0.11, 0.1, 0.31, 0.2], "cafe pilao"), // mesmo produto marcado duas vezes
      a([0.5, 0.5, 0.505, 0.505], "migalha"), // minusculo
      a([0, 0, 0.95, 0.95], "prateleira"), // a foto inteira
      a([0.1, 0.25, 0.3, 0.35], "cafe pilao"), // o vizinho igual: fica (sao 2)
    ]);
    expect(r.map((x) => x.nome)).toEqual(["cafe pilao", "cafe pilao"]);
    expect(iou(r[0].box, r[1].box)).toBe(0);
  });

  it("no repetido fica o legivel", () => {
    const r = limpar([a([0.1, 0.1, 0.3, 0.2], "", false), a([0.1, 0.1, 0.3, 0.21], "leite italac", true)]);
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe("leite italac");
  });

  it("corta o que passa da borda", () => {
    expect(limpar([a([-0.1, 0.9, 0.3, 1.2])])[0].box).toEqual([0, 0.9, 0.3, 1]);
  });

  it("mesmo produto para a casa", () => {
    expect(mesmoProduto("leite", "leite italac")).toBe(true);
    expect(mesmoProduto("Café Pilão 500g", "cafe pilao")).toBe(true);
    expect(mesmoProduto("café pilão", "café melitta")).toBe(false);
    expect(mesmoProduto("farinha de arroz tio joão", "Farinha Arroz Tio Joao 1kg")).toBe(true);
    expect(mesmoProduto("ovos", "ovo")).toBe(true);
    expect(mesmoProduto("", "leite")).toBe(false);
  });

  it("cor pela base da casa, nao pela IA (nao fica tudo amarelo)", () => {
    const base = { legivel: true, conferido: undefined, daMemoria: false, conhecidos: ["leite", "arroz"] };
    expect(corDe({ ...base, nome: "leite italac" })).toBe("verde"); // estoque tem "leite"
    expect(corDe({ ...base, nome: "molho pomarola" })).toBe("amarelo"); // primeira vez
    expect(corDe({ ...base, nome: "molho pomarola", daMemoria: true })).toBe("verde");
    expect(corDe({ ...base, nome: "", legivel: false })).toBe("vermelho");
    expect(corDe({ ...base, nome: "leite italac", legivel: false })).toBe("vermelho");
    // recorte mostra outro produto: o quadrado esta no lugar errado
    expect(corDe({ ...base, nome: "leite italac", conferido: "detergente ype" })).toBe("vermelho");
    expect(corDe({ ...base, nome: "leite italac", conferido: "leite" })).toBe("verde");
    expect(corDe({ ...base, nome: "leite italac", conferido: "" })).toBe("vermelho");
  });

  it("memoria troca o que a IA leu pelo nome da casa", () => {
    const m = new Map([["pilao trad", "Café Pilão"]]);
    expect(daMemoria("Pilão Trad 500g", m)).toBe("Café Pilão");
    expect(daMemoria("leite", m)).toBe(null);
  });

  it("junta iguais em quantidade", () => {
    const g = agrupar([{ nome: "café pilão" }, { nome: "Café Pilão" }, { nome: "leite italac" }, { nome: "" }]);
    expect(g.map((x) => [x.nome, x.qtd])).toEqual([["café pilão", 2], ["leite italac", 1]]);
  });
});

describe("produto sozinho de perto", () => {
  it("aceita um produto que ocupa quase a foto toda", () => {
    const r = limpar([{ box: [0.05, 0.1, 0.95, 0.9], nome: "leite italac", rotulo: "", legivel: true }]);
    expect(r).toHaveLength(1);
  });
  it("com varios produtos, o quadrado gigante (a prateleira) sai", () => {
    const r = limpar([
      { box: [0, 0, 0.9, 0.9], nome: "", rotulo: "", legivel: false },
      { box: [0.1, 0.1, 0.3, 0.3], nome: "milho predilecta", rotulo: "", legivel: true },
    ]);
    expect(r.map((a) => a.nome)).toEqual(["milho predilecta"]);
  });
});

describe("fardo e unidades", () => {
  it("fardo de 12 + 2 soltos do mesmo produto = 14", () => {
    const g = agrupar([
      { nome: "leite italac", unidades: 12 },
      { nome: "leite italac" },
      { nome: "Leite Italac", unidades: 1 },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].qtd).toBe(14);
  });
});
