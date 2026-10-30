import { describe, expect, it } from "vitest";
import {
  escolherMime,
  interpretarLocal,
  numerosPorExtenso,
  extensaoDe,
  intencaoValida,
  normalizaItens,
  segundosFmt,
} from "./voz";

describe("ditado no app", () => {
  it("escolhe o formato que o navegador grava, na ordem de preferencia", () => {
    expect(escolherMime(() => true)).toBe("audio/webm;codecs=opus");
    // iOS Safari: so mp4
    expect(escolherMime((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(escolherMime(() => false)).toBe(null);
  });

  it("casa extensao com o mime, que e como o Whisper escolhe o decoder", () => {
    expect(extensaoDe("audio/webm;codecs=opus")).toBe("webm");
    expect(extensaoDe("audio/mp4")).toBe("m4a");
    expect(extensaoDe("audio/mpeg")).toBe("mp3");
  });

  it("intencao desconhecida cai em lista, que e o erro barato", () => {
    expect(intencaoValida("carrinho")).toBe("carrinho");
    expect(intencaoValida("estoque")).toBe("estoque");
    expect(intencaoValida("comprar_tudo")).toBe("lista");
    expect(intencaoValida(undefined)).toBe("lista");
  });

  it("divide o preco falado pela quantidade, em codigo", () => {
    // "arroz vinte reais, dois pacotes" = 20 no total, 10 por pacote
    const [arroz] = normalizaItens([{ nome: "arroz", qtd: 2, preco_total: 20 }]);
    expect(arroz.preco).toBe(10);
    expect(arroz.unidade).toBe("kg"); // deduzida do nome
  });

  it("sanea o que o modelo devolveu", () => {
    const itens = normalizaItens([
      { nome: "  leite  ", qtd: "1,5", unidade: "L", preco_total: "7,50" },
      { nome: "", qtd: 3 }, // sem nome, nao entra
      { nome: "cafe", qtd: 0 }, // quantidade invalida vira 1
      "lixo",
    ]);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toEqual({ nome: "leite", qtd: 1.5, unidade: "L", preco: 5 });
    expect(itens[1]).toEqual({ nome: "cafe", qtd: 1, unidade: "pct", preco: null });
    expect(normalizaItens(null)).toEqual([]);
  });

  it("formata o tempo de gravacao", () => {
    expect(segundosFmt(0)).toBe("0:00");
    expect(segundosFmt(9)).toBe("0:09");
    expect(segundosFmt(75)).toBe("1:15");
  });
});

describe("entender a frase sem servidor (plano B)", () => {
  it("resolve numero por extenso, inclusive centavo falado", () => {
    expect(numerosPorExtenso("doze e noventa")).toBe("12.9");
    expect(numerosPorExtenso("vinte e cinco")).toBe("25");
    expect(numerosPorExtenso("dois pacotes")).toBe("2 pacotes");
    expect(numerosPorExtenso("meio quilo")).toBe("0.5 quilo");
  });

  it("entende a frase do README, com dois itens e quantidade depois do preco", () => {
    const r = interpretarLocal(
      "comprei arroz cinco reais, dois pacotes, e café doze e noventa, um",
    );
    expect(r.intencao).toBe("carrinho");
    expect(r.itens).toHaveLength(2);
    // cinco reais era o total dos dois pacotes: 2,50 cada
    expect(r.itens[0]).toMatchObject({ nome: "arroz", qtd: 2, preco: 2.5 });
    expect(r.itens[1]).toMatchObject({ nome: "cafe", qtd: 1, preco: 12.9 });
  });

  it("classifica pelo verbo", () => {
    expect(interpretarLocal("preciso de sabão em pó").intencao).toBe("lista");
    expect(interpretarLocal("peguei leite 5 reais").intencao).toBe("carrinho");
    expect(interpretarLocal("tenho 3 pacotes de macarrão").intencao).toBe("estoque");
    expect(interpretarLocal("banana").intencao).toBe("lista"); // sem verbo, erro barato
  });

  it("pega quantidade com unidade e preco por quilo", () => {
    const r = interpretarLocal("comprei 2 kg de carne por 60 reais");
    expect(r.itens[0]).toMatchObject({ nome: "carne", qtd: 2, unidade: "kg", preco: 30 });
  });

  it("frase sem numero nenhum ainda vira item", () => {
    const r = interpretarLocal("preciso de detergente");
    expect(r.itens).toEqual([
      { nome: "detergente", qtd: 1, unidade: "L", preco: null },
    ]);
  });
});

describe("normalizaItens duvida", () => {
  it("so marca duvida quando o modelo diz true; o resto entra direto", () => {
    const [a, b, c] = normalizaItens([
      { nome: "arroz", qtd: 1, duvida: false },
      { nome: "trem azul", qtd: 1, duvida: true },
      { nome: "feijao", qtd: 1, duvida: "sim" },
    ]);
    expect(a.duvida).toBeUndefined();
    expect(b.duvida).toBe(true);
    expect(c.duvida).toBeUndefined();
  });
});

describe("interpretarLocal sem virgula", () => {
  it("cada numero depois de um nome abre item novo (lista ditada de uma vez)", () => {
    const r = interpretarLocal("Comprar um arroz um feijão cinco detergente");
    expect(r.intencao).toBe("lista");
    expect(r.itens.map((i) => [i.nome, i.qtd, i.preco])).toEqual([
      ["arroz", 1, null],
      ["feijao", 1, null],
      ["detergente", 5, null],
    ]);
  });

  it("preco falado continua do item, e quantidade com unidade completa o anterior", () => {
    const r = interpretarLocal("comprei arroz vinte reais dois pacotes");
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ nome: "arroz", qtd: 2, unidade: "pct", preco: 10 });
    const c = interpretarLocal("preciso de carne 2 kg cinco detergente");
    expect(c.itens.map((i) => [i.nome, i.qtd, i.unidade])).toEqual([
      ["carne", 2, "kg"],
      ["detergente", 5, "L"],
    ]);
  });
});

describe("nao precisa comprar", () => {
  it("separa o que comprar do que nao precisa, como a casa fala", () => {
    const r = interpretarLocal(
      "tem que comprar arroz, tem que comprar feijão, mas não precisa comprar macarrão, não precisa comprar creme de leite",
    );
    expect(r.itens.map((i) => [i.nome, !!i.naoPrecisa])).toEqual([
      ["arroz", false],
      ["feijao", false],
      ["macarrao", true],
      ["creme de leite", true],
    ]);
  });

  it("o nao vale ate voltar um comprar sem nao", () => {
    const r = interpretarLocal("não precisa de macarrão e creme de leite, mas preciso de café");
    expect(r.itens.map((i) => [i.nome, !!i.naoPrecisa])).toEqual([
      ["macarrao", true],
      ["creme de leite", true],
      ["cafe", false],
    ]);
  });

  it("da IA, so true vale", () => {
    const [a, b] = normalizaItens([
      { nome: "macarrao", nao_precisa: true },
      { nome: "arroz", nao_precisa: "sim" },
    ]);
    expect(a.naoPrecisa).toBe(true);
    expect(b.naoPrecisa).toBeUndefined();
  });
});
