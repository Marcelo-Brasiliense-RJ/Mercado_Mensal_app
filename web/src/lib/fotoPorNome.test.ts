import { describe, expect, it } from "vitest";
import { buscas, melhor, nota } from "./fotoPorNome";

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
});
