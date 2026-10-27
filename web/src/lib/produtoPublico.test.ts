import { describe, expect, it } from "vitest";
import {
  mapearOpenFoodFacts,
  mapearVtex,
  nomeExibicao,
  nomeGenerico,
  unidadeDe,
} from "./produtoPublico";

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

  it("tira o grito do rotulo sem perder o tamanho", () => {
    expect(nomeExibicao("REFRIGERANTE SUKITA UVA 2L")).toBe("Refrigerante Sukita Uva 2L");
    expect(nomeExibicao("ARROZ TIO JOAO 5KG")).toBe("Arroz Tio Joao 5kg");
    // nome que ja veio normal nao e mexido
    expect(nomeExibicao("Nescafé Café Soluvel Matinal")).toBe("Nescafé Café Soluvel Matinal");
    expect(nomeExibicao("")).toBe("");
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
    ).toEqual({
      nome: "Refrigerante Sukita Uva 2L",
      generico: "refrigerante",
      unidade: "L",
      marca: "SUKITA UVA",
    });
    expect(mapearOpenFoodFacts({ status: 0 })).toBe(null);
    expect(mapearOpenFoodFacts({ status: 1, product: { product_name: "" } })).toBe(null);
  });
});

describe("catalogo VTEX (limpeza e higiene)", () => {
  it("le nome, marca e foto; sem unidade", () => {
    const r = mapearVtex([
      {
        productName: "Absorvente Interno Intimus® Discreto Médio - 16 un",
        brand: "INTIMUS",
        items: [{ images: [{ imageUrl: "https://x/foto.jpg" }] }],
      },
    ]);
    expect(r?.nome).toBe("Absorvente Interno Intimus Discreto Médio 16 un");
    expect(r?.marca).toBe("Intimus");
    expect(r?.foto).toBe("https://x/foto.jpg");
    expect(r?.unidade).toBeNull();
  });
  it("lista vazia: nao achou", () => {
    expect(mapearVtex([])).toBeNull();
    expect(mapearVtex({ erro: 1 })).toBeNull();
  });
});
