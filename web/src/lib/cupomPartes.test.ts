import { describe, expect, it } from "vitest";
import { faixaDaParte, juntarPartes, partesNecessarias, type Cupom } from "./cupomPartes";

const it2 = (nome: string, qtd = 1) => ({ nome, marca: "", qtd, unidade: "un", preco: 2, duvida: false });
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
