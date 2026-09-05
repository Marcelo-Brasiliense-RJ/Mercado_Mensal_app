import { describe, expect, it } from "vitest";
import {
  escolherMime,
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
