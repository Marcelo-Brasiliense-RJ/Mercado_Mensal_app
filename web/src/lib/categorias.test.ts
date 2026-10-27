import { describe, expect, it } from "vitest";
import { categoriaDe } from "./categorias";
import type { Oferta } from "./ofertas";

describe("categoriaDe", () => {
  it.each([
    ["pao de forma", "Padaria"],
    ["farinha de mandioca", "Mercearia"],
    ["brocolis congelado", "Congelados"],
    ["batata congelada", "Congelados"],
    ["batata palha", "Doces e Biscoitos"],
    ["batata", "Hortifruti"],
    ["queijo parmesao", "Frios e Laticínios"],
    ["file de panga", "Carnes"],
    ["creme dental colgate", "Perfumaria e Higiene"],
    ["leite fermentado activia", "Frios e Laticínios"],
    ["Feijão Preto", "Mercearia"],
    ["detergente", "Limpeza"],
  ])("%s -> %s", (nome, cat) => expect(categoriaDe(nome)).toBe(cat));

  it("sem regra: usa a categoria do encarte, senao Outros", () => {
    const o = { id: 1, mercado: "m", produto: "Yakisoba Sakura", marca: "", tamanho: "", categoria: "Mercearia",
      preco_por: 1, preco_de: null, condicao: null, fim: null, tem_foto: false } satisfies Oferta;
    expect(categoriaDe("yakisoba", [o])).toBe("Mercearia");
    expect(categoriaDe("xpto")).toBe("Outros");
  });
});
