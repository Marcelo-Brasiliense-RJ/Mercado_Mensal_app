import { describe, expect, it } from "vitest";
import { parecidos } from "./parecidos";

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
});
