import { describe, expect, it } from "vitest";
import { dasFontesSalvas, lerValor, nomeLivre, paraSalvar, somar } from "./orcamentoFontes";

describe("orcamento por fontes", () => {
  it("le valor como brasileiro digita", () => {
    expect(lerValor("R$ 800,00")).toBe(800);
    expect(lerValor("1.234,56")).toBe(1234.56);
    expect(lerValor("150,5")).toBe(150.5);
    expect(lerValor("1.200")).toBe(1200);
    expect(lerValor("99.9")).toBe(99.9);
    expect(lerValor("")).toBe(0);
    expect(lerValor("abc")).toBe(0);
  });

  it("soma as fontes", () => {
    expect(somar([{ nome: "VR", valor: "600" }, { nome: "VR 2", valor: "500,50" }, { nome: "", valor: "" }])).toBe(1100.5);
  });

  it("atalho repetido ganha numero", () => {
    expect(nomeLivre("VR", [])).toBe("VR");
    expect(nomeLivre("VR", [{ nome: "VR", valor: "" }])).toBe("VR 2");
    expect(nomeLivre("VR", [{ nome: "vr", valor: "" }, { nome: "VR 2", valor: "" }])).toBe("VR 3");
  });

  it("so salva o que tem valor", () => {
    expect(paraSalvar([{ nome: " Dinheiro ", valor: "150" }, { nome: "VR", valor: "" }])).toEqual([
      { nome: "Dinheiro", valor: 150 },
    ]);
  });

  it("fontes velhas (total mudou por fora) viram uma linha com o total", () => {
    expect(dasFontesSalvas([{ nome: "VR", valor: 600 }, { nome: "Dinheiro", valor: 150.5 }], 750.5)).toEqual([
      { nome: "VR", valor: "600" },
      { nome: "Dinheiro", valor: "150,50" },
    ]);
    expect(dasFontesSalvas([{ nome: "VR", valor: 600 }], 900)).toEqual([{ nome: "", valor: "900" }]);
    expect(dasFontesSalvas([], 0)).toEqual([{ nome: "", valor: "" }]);
  });
});
