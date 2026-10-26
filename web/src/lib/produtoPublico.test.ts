import { describe, expect, it } from "vitest";
import { mapearOpenFoodFacts, nomeGenerico, unidadeDe } from "./produtoPublico";

describe("nome pelo codigo de barras", () => {
  it("tira marca e tamanho, sobra o nome generico", () => {
    // caso real do dono, codigo 7891149102808
    expect(nomeGenerico("REFRIGERANTE SUKITA UVA 2L", "SUKITA UVA")).toBe("refrigerante");
    expect(nomeGenerico("Nescafé Café Soluvel Matinal", "Nescafé, Nescafé Suave")).toBe(
      "café soluvel matinal",
    );
    expect(nomeGenerico("Arroz Tio João Tipo 1 5kg", "Tio João")).toBe("arroz tipo 1");
  });

  it("nunca devolve vazio quando havia nome", () => {
    // marca igual ao produto inteiro: cair no nome sem tamanho e melhor que nada
    expect(nomeGenerico("Leite 1L", "Leite")).toBe("leite");
  });

  it("le a unidade do tamanho da embalagem", () => {
    expect(unidadeDe("2l")).toBe("L");
    expect(unidadeDe("500 ml")).toBe("ml");
    expect(unidadeDe("1,5kg")).toBe("kg");
    expect(unidadeDe("100g")).toBe("g");
    expect(unidadeDe("")).toBe(null);
    expect(unidadeDe("pacote")).toBe(null);
  });

  it("mapeia a resposta da base, e devolve null quando nao achou", () => {
    expect(
      mapearOpenFoodFacts({
        status: 1,
        product: { product_name: "REFRIGERANTE SUKITA UVA 2L", brands: "SUKITA UVA", quantity: "2l" },
      }),
    ).toEqual({ nome: "refrigerante", unidade: "L", marca: "SUKITA UVA" });
    expect(mapearOpenFoodFacts({ status: 0 })).toBe(null);
    expect(mapearOpenFoodFacts({ status: 1, product: { product_name: "" } })).toBe(null);
  });
});
