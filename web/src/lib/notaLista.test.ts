import { describe, expect, it } from "vitest";
import { daListaNaNota } from "./notaLista";

const l = (id: string, name: string, status = "pending") => ({ id, name, status });

describe("nota x lista", () => {
  it("risca o que veio na nota, mesmo com nome diferente", () => {
    const lista = [l("1", "arroz tio joão"), l("2", "café"), l("3", "detergente"), l("4", "leite", "bought"), l("5", "wafer")];
    const nota = [{ nome: "arroz" }, { nome: "café" }, { nome: "biscoito wafer" }, { nome: "leite" }];
    expect(daListaNaNota(lista, nota).map((x) => x.id)).toEqual(["1", "2", "5"]);
  });
});
