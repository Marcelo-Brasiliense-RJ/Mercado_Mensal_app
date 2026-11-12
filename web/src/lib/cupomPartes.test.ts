import { describe, expect, it } from "vitest";
import { faixaDaParte, juntarPartes, partesNecessarias, type Cupom } from "./cupomPartes";

// preco diferente por nome, como no cupom de verdade (a emenda compara preco x quantidade)
const it2 = (nome: string, qtd = 1) => ({ nome, marca: "", qtd, unidade: "un", preco: 2 + [...nome].reduce((t, c) => t + c.charCodeAt(0), 0) / 100, duvida: false });
const cup = (itens: ReturnType<typeof it2>[], extra: Partial<Cupom> = {}): Cupom => ({ itens, total: 0, emitente: "", chave: "", qtdItens: 0, ...extra });

describe("nota em partes", () => {
  it("quantas fotos dos itens faltam", () => {
    expect(partesNecessarias(46, 10)).toBe(4); // 46 itens: 4 fotos de ~12
    expect(partesNecessarias(46, 15)).toBe(3); // o rodape ja pegou uma foto inteira
    expect(partesNecessarias(12, 12)).toBe(0); // cupom pequeno: o rodape pegou tudo
    expect(partesNecessarias(0, 5)).toBe(0); // sem a quantidade no rodape
  });

  it("faixa aproximada de cada parte", () => {
    expect(faixaDaParte(1, 3, 46)).toEqual({ de: 1, ate: 16 });
    expect(faixaDaParte(3, 3, 46)).toEqual({ de: 33, ate: 46 });
  });

  it("rodape por ultimo repetindo varias linhas da parte de cima", () => {
    const meio = cup(["a", "b", "c", "d", "e", "f", "g"].map((n) => it2(n)));
    const rodape = cup(["c", "d", "e", "f", "g", "h"].map((n) => it2(n)), { total: 16, qtdItens: 8 });
    const r = juntarPartes([meio, rodape]);
    expect(r.itens.map((i) => i.nome).join("")).toBe("abcdefgh");
    expect(r.qtdItens).toBe(8);
  });

  it("mesmo produto em linhas seguidas com quantidades diferentes nao some", () => {
    const r = juntarPartes([cup([it2("wafer", 6), it2("wafer", 3)]), cup([it2("wafer", 1)])]);
    expect(r.itens.map((i) => i.qtd)).toEqual([6, 3, 1]);
  });
});

describe("prova real com o rodape", () => {
  it("conta como o cupom: soma das quantidades, pesado vale 1", async () => {
    const { contarComoNoCupom, provaReal } = await import("./cupomPartes");
    // trecho do cupom do dono: wafer 6 und, 3 pct, 1 pct; alcatra 4,136 kg; cafe 2 und
    const itens = [
      { qtd: 6, unidade: "un" },
      { qtd: 3, unidade: "pct" },
      { qtd: 1, unidade: "pct" },
      { qtd: 4.136, unidade: "kg" },
      { qtd: 2, unidade: "un" },
    ];
    expect(contarComoNoCupom(itens)).toBe(13);
    expect(provaReal(itens, 13)).toEqual({ lidos: 13, noCupom: 13, bate: true });
    expect(provaReal(itens, 46)?.bate).toBe(false);
    expect(provaReal(itens, 0)).toBeNull();
  });
});

describe("onde faltou", () => {
  it("emenda sem linha repetida aponta o buraco entre as partes", async () => {
    const { juntarComEmendas } = await import("./cupomPartes");
    const p1 = cup(["a", "b", "c"].map((n) => it2(n)));
    const p2 = cup(["c", "d", "e"].map((n) => it2(n))); // encostou: repete "c"
    const p3 = cup(["h", "i"].map((n) => it2(n))); // pulou f e g: buraco antes da parte 3
    const rod = cup(["i", "j"].map((n) => it2(n)), { qtdItens: 10, total: 20 });
    const r = juntarComEmendas([p1, p2, p3, rod]);
    expect(r.semEmenda).toEqual([2]);
    expect(r.cupom.itens.map((i) => i.nome).join("")).toBe("abcdehij");
  });
});

describe("conserto pela linha impressa", () => {
  it("27 cx de bebida lactea a 29,43 com total 29,43 vira 1; alcatra a 7,90 vira 47,90", async () => {
    const { consertarLinha, consistencia } = await import("./cupomPartes");
    expect(consertarLinha({ qtd: 27, preco: 29.43, totalLinha: 29.43 }).qtd).toBe(1);
    expect(consertarLinha({ qtd: 4.136, preco: 7.9, totalLinha: 198.11 }).preco).toBe(47.9);
    expect(consertarLinha({ qtd: 6, preco: 2.97, totalLinha: 17.82 })).toEqual({ qtd: 6, preco: 2.97, totalLinha: 17.82 });
    expect(consistencia([{ qtd: 1, preco: 2, totalLinha: 2 }, { qtd: 2, preco: 2, totalLinha: 4 }, { qtd: 1, preco: 3, totalLinha: 3 }])).toBe(1);
  });
});

describe("emenda com nome lido diferente", () => {
  it("mesma linha com nome abreviado numa foto e completo na outra encaixa", async () => {
    const { juntarComEmendas } = await import("./cupomPartes");
    const l = (nome: string, qtd: number, preco: number) => ({ nome, marca: "", qtd, unidade: "un", preco, duvida: false });
    const a = cup([]);
    a.itens = [l("cafe", 2, 22.9), l("biscoito piraque wafer", 6, 2.97), l("biscoito passatempo", 2, 2.69)];
    const b = cup([], { qtdItens: 12 });
    b.itens = [l("bisc. piraque wafer", 6, 2.97), l("bisc passatempo", 2, 2.69), l("chips", 1, 21.99)];
    const r = juntarComEmendas([a, b]);
    expect(r.semEmenda).toEqual([]);
    expect(r.cupom.itens).toHaveLength(4);
  });
});

describe("emenda da nota real (ordem e nome trocados)", () => {
  it("catchup x ketchup e wafer 6/3 invertidos encaixam", async () => {
    const { juntarComEmendas } = await import("./cupomPartes");
    const l = (nome: string, qtd: number, preco: number) => ({ nome, marca: "", qtd, unidade: "un", preco, duvida: false });
    const a = cup([]);
    a.itens = [l("mostarda", 1, 11.99), l("catchup", 1, 16.9), l("maionese", 1, 9.9), l("pao de forma", 2, 5.98), l("wafer", 6, 2.97), l("wafer", 3, 2.97), l("wafer", 1, 2.97), l("passatempo", 2, 2.69)];
    const b = cup([], { qtdItens: 30 });
    b.itens = [l("ketchup", 1, 16.9), l("maionese", 1, 9.9), l("pao de forma", 2, 5.98), l("wafer", 3, 2.97), l("wafer", 6, 2.97), l("wafer", 1, 2.97), l("biscoito", 2, 2.69), l("piraque", 2, 2.79)];
    const r = juntarComEmendas([a, b]);
    expect(r.semEmenda).toEqual([]);
    expect(r.cupom.itens.map((i) => i.nome)).toEqual(["mostarda", "catchup", "maionese", "pao de forma", "wafer", "wafer", "wafer", "passatempo", "piraque"]);
  });
});

describe("fotos que pegaram o cupom quase inteiro (print do dono: 'Li 90 de 46')", () => {
  // 32 linhas, precos distintos; algumas com qtd > 1, como a nota real
  const linhas = Array.from({ length: 32 }, (_, i) => ({ nome: `item${i}`, marca: "", qtd: i % 5 === 0 ? 2 : 1, unidade: "un", preco: 3 + i * 0.37, duvida: false }));
  const qtd = linhas.reduce((t, l) => t + l.qtd, 0);

  it("as duas repetem quase tudo: nao soma, fica cada linha uma vez", async () => {
    const { juntarComEmendas, contarComoNoCupom } = await import("./cupomPartes");
    const foto1 = cup([]);
    foto1.itens = linhas.slice(0, 31).map((l, i) => (i === 7 ? { ...l, preco: l.preco + 1 } : l)); // sem a ultima e uma lida errada
    const foto2 = cup([], { qtdItens: qtd + 5 }); // rodape diz outra coisa: nenhuma foto sozinha fecha
    foto2.itens = linhas.slice(1).map((l) => ({ ...l, nome: l.nome.toUpperCase() }));
    const r = juntarComEmendas([foto1, foto2]);
    expect(r.semEmenda).toEqual([]);
    expect(r.cupom.itens).toHaveLength(32);
    expect(contarComoNoCupom(r.cupom.itens)).toBe(qtd);
  });

  it("uma foto sozinha fecha a prova real: fica com ela", async () => {
    const { juntarComEmendas } = await import("./cupomPartes");
    const ruim = cup([]);
    ruim.itens = linhas.slice(0, 20).map((l) => ({ ...l, preco: l.preco + 0.5 })); // tudo lido torto: nao emenda
    const inteira = cup([], { qtdItens: qtd, total: 99 });
    inteira.itens = linhas;
    const r = juntarComEmendas([ruim, inteira]);
    expect(r.cupom.itens).toBe(linhas);
    expect(r.semEmenda).toEqual([]);
    expect(r.cupom.total).toBe(99);
  });

  it("metades de verdade (sem repeticao) continuam apontando o buraco", async () => {
    const { juntarComEmendas } = await import("./cupomPartes");
    const cima = cup([]);
    cima.itens = linhas.slice(0, 14);
    const baixo = cup([], { qtdItens: qtd });
    baixo.itens = linhas.slice(18);
    const r = juntarComEmendas([cima, baixo]);
    expect(r.semEmenda).toEqual([1]);
    expect(r.cupom.itens).toHaveLength(28);
  });
});
