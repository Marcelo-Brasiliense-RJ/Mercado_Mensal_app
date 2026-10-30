import { describe, expect, it } from "vitest";
import { buscas, melhor, nota, urlFoto } from "./fotoPorNome";

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
    expect(urlFoto(" Hibisco Em Pó ")).toBe("/api/foto?v=3&nome=hibisco%20em%20p%C3%B3");
  });
});
