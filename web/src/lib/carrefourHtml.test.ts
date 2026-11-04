import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerCartoes, paginaCarrefour } from "./carrefourHtml";

describe("cartoes do site do Carrefour", () => {
  it("le nome, preco, riscado, foto e link", () => {
    const html = readFileSync(new URL("./carrefourHtml.fixture.html", import.meta.url), "utf8");
    const [p] = lerCartoes(html);
    expect(p).toMatchObject({
      nome: "Arroz Branco Longo-fino Tipo 1 Namorado 5Kg",
      preco: 20.19,
      de: 25.19,
      url: "https://mercado.carrefour.com.br/produto/arroz-branco-longo-fino-tipo-1-namorado-5kg-5854",
    });
    expect(p.foto).toContain("vtexassets.com/arquivos/ids/196492");
  });
  it("html sem cartao: lista vazia", () => expect(lerCartoes("<html></html>")).toEqual([]));
  it("monta o endereco", () => {
    expect(paginaCarrefour({ categoria: "mercearia" })).toBe("https://mercado.carrefour.com.br/categoria/mercearia?sort=discount_desc");
    expect(paginaCarrefour({ q: "arroz" })).toBe("https://mercado.carrefour.com.br/busca/arroz");
  });
});
