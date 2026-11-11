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
      { itens: [it2("arroz", 25), it2("feijao", 8), it2("cafe", 18)], total: 0, emitente: "Mercado X", chave: "" },
      { itens: [it2("feijao", 8), it2("cafe", 18), it2("leite", 5)], total: 56, emitente: "", chave: "1".repeat(44) },
    ]);
    expect(r.itens.map((i) => i.nome)).toEqual(["arroz", "feijao", "cafe", "leite"]);
    expect(r.total).toBe(56);
    expect(r.emitente).toBe("Mercado X");
    expect(r.chave).toHaveLength(44);
  });
});
