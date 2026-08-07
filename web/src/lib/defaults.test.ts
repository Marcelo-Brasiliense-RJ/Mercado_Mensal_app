import { describe, it, expect } from "vitest";
import { unitFor, findByName, stepFor } from "./defaults";

describe("unitFor", () => {
  it("deduz kg, L, dz e pct por palavra-chave", () => {
    expect(unitFor("arroz")).toBe("kg");
    expect(unitFor("leite")).toBe("L");
    expect(unitFor("ovos")).toBe("dz");
    expect(unitFor("macarrao")).toBe("pct");
  });

  it("ignora acento e caixa", () => {
    expect(unitFor("Feijão")).toBe("kg");
    expect(unitFor("ÓLEO")).toBe("L");
  });

  it("acha a palavra-chave dentro de um nome composto", () => {
    expect(unitFor("leite integral")).toBe("L");
    expect(unitFor("arroz branco tipo 1")).toBe("kg");
  });

  it("cai em un para desconhecido e para vazio", () => {
    expect(unitFor("sabonete")).toBe("un");
    expect(unitFor("")).toBe("un");
    expect(unitFor("   ")).toBe("un");
  });
});

describe("stepFor", () => {
  it("anda de meio em meio no que se compra fracionado", () => {
    expect(stepFor("kg")).toBe(0.5);
    expect(stepFor("L")).toBe(0.5);
    expect(stepFor("ml")).toBe(0.5);
  });

  it("anda de um em um no resto, inclusive unidade desconhecida", () => {
    expect(stepFor("un")).toBe(1);
    expect(stepFor("dz")).toBe(1);
    expect(stepFor("")).toBe(1);
  });
});

describe("findByName", () => {
  const stock = [{ name: "arroz" }, { name: "feijão" }];

  it("casa ignorando acento e caixa", () => {
    expect(findByName("Arroz", stock)?.name).toBe("arroz");
    expect(findByName("feijao", stock)?.name).toBe("feijão");
  });

  it("devolve undefined quando nao existe ou o nome e vazio", () => {
    expect(findByName("leite", stock)).toBeUndefined();
    expect(findByName("", stock)).toBeUndefined();
  });
});
