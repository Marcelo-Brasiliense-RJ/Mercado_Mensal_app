import { describe, expect, it } from "vitest";
import { agrupar, corDe, daMemoria, iou, juntarIguais, limpar, marcarCarrinho, mesmoProduto, type Achado } from "./prateleira";

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
    expect(corDe({ ...base, nome: "leite italac", legivel: false })).toBe("amarelo"); // palpite de algo que a casa tem: confirma
    expect(corDe({ ...base, nome: "molho pomarola", legivel: false })).toBe("vermelho");
    // recorte mostra outro produto: o quadrado esta no lugar errado
    expect(corDe({ ...base, nome: "leite italac", legivel: false, conferido: "detergente ype" })).toBe("vermelho");
    expect(corDe({ ...base, nome: "leite italac", conferido: "detergente ype" })).toBe("amarelo"); // leu o rotulo: confirma
    // sachês sobrepostos: o recorte pegou o vizinho, vale o rotulo
    expect(corDe({ ...base, nome: "passata pramesa", conferido: "molho de tomate predilecta", vizinhos: ["molho de tomate predilecta"] })).toBe("verde");
    expect(corDe({ ...base, nome: "leite italac", conferido: "leite" })).toBe("verde");
    expect(corDe({ ...base, nome: "leite italac", conferido: "" })).toBe("amarelo");
    // leu e o recorte concorda: obvio, verde mesmo sendo a primeira vez
    expect(corDe({ ...base, nome: "passata pramesa", conferido: "passata pramesa" })).toBe("verde");
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

describe("foto do carrinho: so o novo", () => {
  it("o que ja esta no carrinho fica cinza; o resto e novo", () => {
    const r = marcarCarrinho(
      [
        { nome: "óleo de soja coamo", unidades: 4 } as { nome: string; unidades: number; carrinho?: boolean },
        { nome: "leite italac", unidades: 1 },
        { nome: "leite italac", unidades: 1 },
        { nome: "arroz camil", unidades: 1 },
      ],
      [
        { name: "Óleo de Soja Coamo", quantity: 4 },
        { name: "leite italac", quantity: 1 },
      ],
    );
    expect(r.map((c) => !!c.carrinho)).toEqual([true, true, false, false]);
  });
});

describe("juntar iguais vizinhos", () => {
  it("4 oleos marcados um a um (e a tampa de tras) viram um quadrado x4", () => {
    const r = juntarIguais([
      { box: [0.4, 0.4, 0.8, 0.5], nome: "óleo de soja coamo", rotulo: "", legivel: true },
      { box: [0.4, 0.49, 0.82, 0.6], nome: "óleo de soja coamo", rotulo: "", legivel: true },
      { box: [0.4, 0.58, 0.8, 0.7], nome: "oleo coamo", rotulo: "", legivel: false },
      { box: [0.4, 0.52, 0.45, 0.57], nome: "", rotulo: "", legivel: false },
      { box: [0.45, 0.05, 0.8, 0.2], nome: "passata pramesa", rotulo: "", legivel: true },
    ]);
    expect(r).toHaveLength(2);
    expect(r.find((a) => a.nome.includes("coamo"))!.unidades).toBe(4);
  });
  it("produtos diferentes encostados ficam separados", () => {
    const r = juntarIguais([
      { box: [0.4, 0.05, 0.8, 0.2], nome: "passata pramesa", rotulo: "", legivel: true },
      { box: [0.4, 0.19, 0.8, 0.3], nome: "molho de tomate pramesa", rotulo: "", legivel: true },
    ]);
    expect(r).toHaveLength(2);
  });
});

import { nomeDoRotulo } from "./server/prateleira";
describe("nome pelo rotulo", () => {
  it("tira tamanho e simbolos", () => {
    expect(nomeDoRotulo("Pramesa PASSATA DI POMODORO 300g")).toBe("pramesa passata di pomodoro");
    expect(nomeDoRotulo("")).toBe("");
  });
});

import { dividir, opcoesDe } from "./prateleira";
describe("opcoes claras", () => {
  it("tira o generico quando ha nome de verdade", () => {
    expect(opcoesDe(["flocos de cereais neston", "cereal"])).toEqual(["flocos de cereais neston"]);
    expect(opcoesDe(["bebida", "aperitivo aperol"])).toEqual(["aperitivo aperol"]);
    expect(opcoesDe(["leite italac", "Leite Italac"])).toEqual(["leite italac"]);
  });
  it("separa um quadrado em 4", () => {
    expect(dividir([0, 0, 0.5, 1], 4)).toHaveLength(4);
  });
});
