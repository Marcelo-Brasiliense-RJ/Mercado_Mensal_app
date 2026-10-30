import { describe, expect, it } from "vitest";
import { parecidos, repetidos } from "./parecidos";

const estoque = [
  { name: "farinha de mandioca tipity granulada 500g" },
  { name: "farinha de trigo dona benta" },
  { name: "arroz tio joão 5kg" },
];

describe("parecidos", () => {
  it("acha o mesmo produto com outro nome", () => {
    expect(parecidos("tipity granulada torrada e empacotada", estoque).map((x) => x.name)).toEqual([
      "farinha de mandioca tipity granulada 500g",
    ]);
  });
  it("uma palavra em comum não basta", () => {
    expect(parecidos("farinha láctea nestlé", estoque)).toEqual([]);
  });
  it("nome igual não é parecido (é o mesmo)", () => {
    expect(parecidos("arroz tio joão 5kg", estoque)).toEqual([]);
  });

  it("repetidos do estoque: só quando um nome contém o outro", () => {
    const itens = [
      { id: "1", name: "óleo de soja coamo 900ml" },
      { id: "2", name: "óleo de soja coamo refinado 900ml" },
      { id: "3", name: "vinagre de arroz kenko 750ml" },
      { id: "4", name: "vinagre de cereal arroz kenko 750ml" },
      { id: "5", name: "leite integral italac" },
      { id: "6", name: "leite integral piracanjuba" },
      { id: "7", name: "arroz" },
    ];
    expect(repetidos(itens).map((g) => g.map((x) => x.id))).toEqual([["1", "2"], ["3", "4"]]);
  });
});
