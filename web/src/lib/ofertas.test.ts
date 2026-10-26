import { describe, expect, it } from "vitest";
import { casaBusca, casaItem, maisBarato, porUnidade, prazo, resumir, type ItemFalta, type Oferta } from "./ofertas";

let id = 0;
const of = (o: Partial<Oferta>): Oferta => ({
  id: ++id, mercado: "guanabara", produto: "", marca: "", tamanho: "", categoria: "Mercearia",
  preco_por: 1, preco_de: null, condicao: null, fim: null, tem_foto: false, ...o,
});
const item = (nome: string): ItemFalta => ({
  nome, unidade: "un", origem: "repor", quantidade: 1, ultimo_preco: null, ultima_marca: null,
});

describe("casaItem", () => {
  it("primeira palavra abre o nome; sem acento e sem maiuscula", () => {
    expect(casaItem(of({ produto: "Açúcar Refinado União" }), "acucar refinado")).toBe(true);
    expect(casaItem(of({ produto: "Sabonete Leite de Cabra" }), "leite")).toBe(false);
  });
  it("tamanho em qualquer grafia", () => {
    expect(casaItem(of({ produto: "Leite UHT Integral Italac", tamanho: "1 Litro" }), "leite integral 1l")).toBe(true);
  });
});

describe("busca", () => {
  it("palavras em qualquer ordem, inclusive mercado", () => {
    expect(casaBusca(of({ produto: "Arroz Rei do Sul", tamanho: "5kg" }), "arroz 5kg")).toBe(true);
    expect(casaBusca(of({ produto: "Arroz Rei do Sul", mercado: "mundial" }), "arroz mundial")).toBe(true);
    expect(casaBusca(of({ produto: "Feijão" }), "arroz")).toBe(false);
  });
});

describe("preco por kg", () => {
  it("5kg por 14,95 sai mais barato que 1kg por 4,95", () => {
    const grande = of({ produto: "Arroz", tamanho: "5kg", preco_por: 14.95 });
    const pequeno = of({ produto: "Arroz", tamanho: "1 kg", preco_por: 4.95 });
    expect(porUnidade(grande)?.valor).toBeCloseTo(2.99);
    expect([pequeno, grande].sort(maisBarato)[0]).toBe(grande);
  });
  it("gramas e ml viram kg e litro", () => {
    expect(porUnidade(of({ produto: "Café 500g", preco_por: 15 }))).toEqual({ valor: 30, u: "kg" });
    expect(porUnidade(of({ produto: "Óleo", tamanho: "900ml", preco_por: 9 }))?.u).toBe("L");
  });
});

describe("resumir", () => {
  const ofertas = [
    of({ produto: "Arroz Tio João", tamanho: "5kg", preco_por: 27.95, mercado: "guanabara" }),
    of({ produto: "Arroz Rei do Sul", tamanho: "5kg", preco_por: 14.95, mercado: "mundial" }),
    of({ produto: "Feijão Preto", tamanho: "1kg", preco_por: 3.99, mercado: "guanabara" }),
    of({ produto: "Biscoito", preco_por: 2, preco_de: 4, categoria: "Mercearia", mercado: "superbom" }),
  ];
  const r = resumir(ofertas, [item("arroz"), item("feijao preto"), item("palmito")]);

  it("o mais barato de cada item vem primeiro e item sem oferta vai para o fim", () => {
    expect(r.itens.map((x) => x.item.nome)).toEqual(["arroz", "feijao preto", "palmito"]);
    expect(r.itens[0].opcoes[0].produto).toBe("Arroz Rei do Sul");
    expect(r.comOferta).toBe(2);
  });
  it("onde comprar: quem tem mais itens primeiro", () => {
    expect(r.mercados[0]).toEqual({ mercado: "guanabara", itens: 2, total: 27.95 + 3.99 });
    expect(r.melhorTotal).toBeCloseTo(14.95 + 3.99);
    expect(r.lojasMelhor).toBe(2);
  });
  it("achados ficam fora do que ja falta", () => {
    expect(r.achados.map((o) => o.produto)).toEqual(["Biscoito"]);
  });
});

describe("prazo", () => {
  const agora = new Date("2026-10-26T15:00:00-03:00");
  it("hoje, amanha e data", () => {
    expect(prazo(of({ fim: "2026-10-26T23:59:00-03:00" }), agora)).toEqual({ texto: "Termina hoje", urgente: true });
    expect(prazo(of({ fim: "2026-10-27T23:59:00-03:00" }), agora)?.texto).toBe("Termina amanhã");
    expect(prazo(of({ fim: "2026-10-30T23:59:00-03:00" }), agora)?.urgente).toBe(false);
    expect(prazo(of({ fim: null }), agora)).toBeNull();
  });
});
