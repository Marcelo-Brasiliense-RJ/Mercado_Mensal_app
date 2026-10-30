import { describe, expect, it } from "vitest";
import { buscas, melhor, nota, parecido, urlFoto } from "./fotoPorNome";

describe("foto pelo nome", () => {
  it("prefere o produto com as palavras do item", () => {
    const c = [
      { nome: "Açaí Frooty Cremoso 1,02kg" },
      { nome: "Açaí com Guaraná Concentrado Açaicamp 1L" },
    ];
    expect(melhor("açaí com guaraná concentrado açaicamp 1l", c)?.nome).toBe("Açaí com Guaraná Concentrado Açaicamp 1L");
  });

  it("sem produto bom, nenhuma foto (melhor o ícone que a foto errada)", () => {
    expect(melhor("açaí com guaraná concentrado açaicamp 1l", [{ nome: "Açaí Frooty Cremoso 1,02kg" }])).toBeNull();
    // mesmo tipo, outra marca: no nome longo nao serve
    expect(melhor("açaí com guaraná concentrado açaicamp 1l", [{ nome: "Açaí com Guaraná Concentrado Frooty" }])).toBeNull();
    expect(melhor("molho de pimenta oruam chipotle defumado", [{ nome: "Molho de Tomate Pomarola 300g" }])).toBeNull();
  });

  it("o que é (primeira palavra) é obrigatório", () => {
    expect(nota("cloro", "Água Sanitária com Cloro Ativo")).toBe(0);
    expect(nota("cloro", "Cloro Gel Vim 700ml")).toBe(1);
  });

  it("nome curto continua achando", () => {
    expect(melhor("arroz", [{ nome: "Arroz Branco Tio João 5kg" }])?.nome).toBe("Arroz Branco Tio João 5kg");
  });

  it("buscas do específico para o geral, sem tamanho e palavras vazias", () => {
    expect(buscas("detergente líquido odd com poder do bicarbonato de sódio 500ml")).toEqual([
      "detergente líquido odd com poder do bicarbonato de sódio 500ml",
      "detergente liquido odd poder bicarbonato sodio",
      "detergente liquido odd",
    ]);
  });

  it("palavra em comum não basta (hibisco em pó não é sabão em pó)", () => {
    expect(melhor("Hibisco Em Pó Puro", [{ nome: "Lava Roupas em Pó Omo Puro Cuidado 800g" }, { nome: "Omo Puro Cuidado" }])).toBeNull();
    expect(melhor("Hibisco Em Pó Puro", [{ nome: "Hibisco em Pó Puro Kodilar 100g" }])?.nome).toBe("Hibisco em Pó Puro Kodilar 100g");
  });

  it("endereço versionado: regra nova não usa foto velha guardada", () => {
    expect(urlFoto(" Hibisco Em Pó ")).toBe("/api/foto?v=4&nome=hibisco%20em%20p%C3%B3");
  });
});

describe("parecido (segunda chance)", () => {
  const c = (nome: string) => ({ nome });
  it("aceita o mesmo produto de outra marca", () => {
    expect(parecido("oleo de soja coamo", [c("Óleo Soja Vitaliv 900ml")])?.nome).toBe("Óleo Soja Vitaliv 900ml");
    expect(parecido("peito de frango moido", [c("Peito de Frango Sadia 1kg")])).not.toBeNull();
  });
  it("nome de duas palavras nao tem segunda chance (variedade errada engana)", () => {
    expect(parecido("xarope de acai", [c("Xarope Dilute Tangerina 500ml")])).toBeNull();
    expect(parecido("farinha neston", [c("Farinha de Rosca 500g")])).toBeNull();
  });
  it("continua exigindo comecar pelo que o item e", () => {
    expect(parecido("alho", [c("Tempero Alho e Sal")])).toBeNull();
    expect(parecido("cloro", [c("Agua Sanitaria com Cloro")])).toBeNull();
  });
  it("recusa quando bate menos da metade das palavras", () => {
    expect(parecido("leite condensado moca light", [c("Leite Condensado Itambe")])).toBeNull();
  });
});
