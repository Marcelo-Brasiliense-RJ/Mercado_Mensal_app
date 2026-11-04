import { describe, expect, it } from "vitest";
import { acentuar, nomeBonito } from "./nomeBonito";

describe("nome bonito", () => {
  it("acento e maiuscula", () => {
    expect(nomeBonito("oleo de soja coamo")).toBe("Óleo de Soja Coamo");
    expect(nomeBonito("oleo coamo")).toBe("Óleo Coamo");
    expect(nomeBonito("feijão preto")).toBe("Feijão Preto");
    expect(nomeBonito("creme de leite UHT")).toBe("Creme de Leite UHT");
    expect(nomeBonito("  acucar  união ")).toBe("Açúcar União");
  });
  it("acentuar nao mexe na caixa", () => {
    expect(acentuar("oleo de soja")).toBe("óleo de soja");
    expect(acentuar("Cafe Pilão")).toBe("Café Pilão");
  });
});
