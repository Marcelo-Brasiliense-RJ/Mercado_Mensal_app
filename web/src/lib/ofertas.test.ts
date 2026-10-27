import { describe, expect, it } from "vitest";
import { casaBusca, casaItem, corredor, desejosDa, maisBarato, melhorQue, nomeBonito, ofertasDo, porMercado, porUnidade, precoSubiu, prazo, resumir, termoDe, type ItemFalta, type Oferta } from "./ofertas";

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

describe("melhorQue (aviso no carrinho)", () => {
  const ofertas = [
    of({ produto: "Manteiga com Sal Aviação", tamanho: "200g", preco_por: 12.9, mercado: "guanabara" }),
    of({ produto: "Manteiga Itambé", tamanho: "200g", preco_por: 14.5, mercado: "mundial" }),
  ];
  it("avisa quando outro mercado esta mais barato", () => {
    const r = melhorQue(ofertas, "manteiga", 16.9);
    expect(r?.oferta.mercado).toBe("guanabara");
    expect(r?.economia).toBeCloseTo(4);
  });
  it("nao avisa quando o preco do carrinho ja e melhor ou a diferenca e minima", () => {
    expect(melhorQue(ofertas, "manteiga", 12.0)).toBeNull();
    expect(melhorQue(ofertas, "manteiga", 12.95)).toBeNull();
  });
  it("sem preco ou sem oferta, sem aviso", () => {
    expect(melhorQue(ofertas, "manteiga", null)).toBeNull();
    expect(melhorQue(ofertas, "palmito", 10)).toBeNull();
  });
  it("item vendido por kg compara por kg", () => {
    const carne = [of({ produto: "Patinho", tamanho: "500g", preco_por: 20 })]; // R$ 40/kg
    expect(melhorQue(carne, "patinho", 45, "kg")?.economia).toBeCloseTo(5);
    expect(melhorQue(carne, "patinho", 35, "kg")).toBeNull();
  });
});

describe("precoSubiu", () => {
  it("avisa so com alta de verdade", () => {
    expect(precoSubiu(12, 10)).toBeCloseTo(0.2);
    expect(precoSubiu(11, 10)).toBeNull(); // 10%: normal
    expect(precoSubiu(2.3, 2)).toBeNull(); // 15% mas so R$ 0,30
    expect(precoSubiu(12, null)).toBeNull();
    expect(precoSubiu(null, 10)).toBeNull();
  });
});

describe("porMercado e corredor", () => {
  const ofertas = [
    of({ produto: "Arroz", tamanho: "5kg", preco_por: 14.95, mercado: "guanabara", categoria: "Mercearia" }),
    of({ produto: "Arroz", tamanho: "5kg", preco_por: 19.6, mercado: "mundial", categoria: "Mercearia" }),
    of({ produto: "Detergente", preco_por: 1.99, mercado: "mundial", categoria: "Limpeza" }),
  ];
  it("conta quantos itens valem em cada mercado", () => {
    const itens = [{ name: "arroz" }, { name: "detergente" }, { name: "palmito" }];
    const { melhor, conta } = porMercado(itens, ofertas);
    expect(conta).toEqual({ guanabara: 1, mundial: 1 });
    expect(melhor.get(itens[0])?.mercado).toBe("guanabara");
    expect(melhor.has(itens[2])).toBe(false);
  });
  it("hortifruti antes de limpeza; desconhecido no fim", () => {
    expect(corredor("Hortifruti")).toBeLessThan(corredor("Limpeza"));
    expect(corredor("xyz")).toBeGreaterThan(corredor("Outros"));
  });
});

describe("de olho", () => {
  const ofertas = [
    of({ produto: "Acém Bovino Resfriado", tamanho: "kg", preco_por: 24.9, mercado: "guanabara" }),
    of({ produto: "Acém em Bife", preco_por: 22.5, mercado: "mundial" }),
    of({ produto: "Sabonete Acém", preco_por: 2 }),
  ];
  it("termo da oferta: duas palavras, sem 'em' nem tamanho", () => {
    expect(termoDe(ofertas[1])).toBe("acem bife");
    expect(termoDe(of({ produto: "Azeite Extra Virgem Andorinha 500ml" }))).toBe("azeite extra");
  });
  it("nome bonito copia a grafia do encarte", () => {
    expect(nomeBonito("acem", ofertas)).toBe("Acém");
    expect(nomeBonito("palmito", ofertas)).toBe("Palmito");
    expect(nomeBonito("acem", [of({ produto: "Paleta, Peito ou Acém Bovino" })])).toBe("Acém");
  });
  it("ofertas do desejo, mais barata primeiro, e estrela do card", () => {
    const d = { id: 1, termo: "acem", nome: "Acém", tem_foto: false };
    expect(ofertasDo(d, ofertas).map((o) => o.mercado)).toEqual(["mundial", "guanabara"]);
    expect(desejosDa(ofertas[2], [d])).toEqual([]);
    expect(desejosDa(ofertas[0], [d])).toEqual([d]);
    expect(desejosDa(of({ produto: "Paleta, Peito ou Acém Bovino" }), [d])).toEqual([d]);
  });
});
