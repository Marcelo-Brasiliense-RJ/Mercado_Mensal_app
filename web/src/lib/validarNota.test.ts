import { describe, expect, it } from "vitest";
import { agrupar } from "./validarNota";

describe("validar nota em tres grupos", () => {
  it("certo, novo e duvida", () => {
    const nota = [
      { nome: "arroz" }, // na lista
      { nome: "café" }, // na despensa
      { nome: "tahine" }, // novo
      { nome: "bisc", duvida: true }, // borrado
      { nome: "biscoito" }, // casa com 2 da lista
    ];
    const lista = [
      { id: "l1", name: "arroz tio joão", status: "pending" },
      { id: "l2", name: "biscoito wafer", status: "pending" },
      { id: "l3", name: "biscoito passatempo", status: "pending" },
    ];
    const g = agrupar(nota, lista, ["Café", "Leite"]);
    expect(g.certos).toEqual([0, 1]);
    expect(g.novos).toEqual([2]);
    expect(g.duvidas.map((d) => [d.i, d.tipo])).toEqual([[3, "ilegivel"], [4, "lista"]]);
    expect(g.riscar).toEqual({ 0: "l1" });
  });
});
