import { describe, expect, it } from "vitest";
import { juntarPartes, normalizaCupom, totalConfere } from "./cupom";

describe("cupom pela foto", () => {
  it("normaliza o que a IA devolve", () => {
    const c = normalizaCupom({
      itens: [
        { nome: "Arroz", marca: "Tio João", qtd: 2, unidade: "PCT", preco: 25.9 },
        { nome: "banana", qtd: 0.756, unidade: "KG", preco: 6.99 },
        { nome: "leite", qtd: 0, unidade: "l", preco: -1 },
        { nome: "", qtd: 1, unidade: "un", preco: 1 },
      ],
      total: 64.3,
      emitente: " Supermercado X ",
      chave: "3326 1112 3456 7800 0123 6500 1000 0123 4510 0012 3456",
    });
    expect(c.itens).toEqual([
      { nome: "arroz", marca: "Tio João", qtd: 2, unidade: "pct", preco: 25.9, duvida: false },
      { nome: "banana", marca: "", qtd: 0.756, unidade: "kg", preco: 6.99, duvida: false },
      { nome: "leite", marca: "", qtd: 1, unidade: "L", preco: 0, duvida: false },
    ]);
    expect(c.emitente).toBe("Supermercado X");
    expect(c.chave).toHaveLength(44);
    expect(normalizaCupom({ chave: "123" }).chave).toBe("");
  });

  it("confere a soma com o total, com folga de arredondamento", () => {
    const itens = [{ nome: "a", marca: "", qtd: 2, unidade: "un", preco: 10, duvida: false }];
    expect(totalConfere({ itens, total: 20.5 })).toBe(true);
    expect(totalConfere({ itens, total: 30 })).toBe(false);
    expect(totalConfere({ itens, total: 0 })).toBe(true);
  });
});

describe("cupom em partes lidas em paralelo", () => {
  const it2 = (nome: string, preco: number) => ({ nome, marca: "", qtd: 1, unidade: "un", preco, duvida: false });
  it("tira o item repetido na emenda e pega total e chave do pe", () => {
    const r = juntarPartes([
      { itens: [it2("arroz", 25), it2("feijao", 8), it2("cafe", 18)], total: 0, emitente: "Mercado X", chave: "", qtdItens: 0 },
      { itens: [it2("feijao", 8), it2("cafe", 18), it2("leite", 5)], total: 56, emitente: "", chave: "1".repeat(44), qtdItens: 4 },
    ]);
    expect(r.itens.map((i) => i.nome)).toEqual(["arroz", "feijao", "cafe", "leite"]);
    expect(r.total).toBe(56);
    expect(r.emitente).toBe("Mercado X");
    expect(r.chave).toHaveLength(44);
  });
});

describe("onde esta o que faltou", () => {
  const lidos = [
    { nome: "leite", qtd: 12, unidade: "un", preco: 4.79 },
    { nome: "papel higiênico", qtd: 1, unidade: "pct", preco: 22.9 },
  ];
  it("linha de fora vem com a posicao; quantidade igual a lida e descartada", async () => {
    const { normalizaFalta } = await import("./cupom");
    const r = normalizaFalta(
      {
        faltam: [
          { tipo: "linha", texto: "OLEO SOJA LIZA 900ML", nome: "Óleo de soja", marca: "Liza", qtd: 2, unidade: "UN", preco: 7.99, depois_de: 1 },
          { tipo: "quantidade", texto: "1 PCT X 22,90", nome: "papel", qtd: 1, preco: 22.9, depois_de: 2, indice: 2 },
          { tipo: "quantidade", texto: "6 UN", nome: "leite", qtd: 6, preco: 4.79, depois_de: 1, indice: 1 },
          { tipo: "linha", texto: "x", nome: "fora da lista", qtd: 1, preco: 1, depois_de: 99 },
        ],
      },
      lidos,
    );
    expect(r.map((f) => [f.tipo, f.nome, f.depoisDe, f.indice])).toEqual([
      ["linha", "óleo de soja", 1, 1],
      ["quantidade", "leite", 1, 1],
      ["linha", "fora da lista", 2, 0],
    ]);
    expect(r[0].unidade).toBe("un");
  });
  it("prompt numera a lista na ordem do cupom", async () => {
    const { promptFalta } = await import("./cupom");
    const p = promptFalta(lidos, 14, 13);
    expect(p).toContain("1. leite | 12 un | R$ 4,79");
    expect(p).toContain("faltam 1");
  });
});
