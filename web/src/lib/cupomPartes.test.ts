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
