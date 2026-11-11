import { describe, expect, it } from "vitest";
import { conferir } from "./conferencia";

const c = (name: string, unit_price: number, quantity = 1) => ({ name, quantity, unit: "un", unit_price });
const n = (nome: string, preco: number, qtd = 1, marca = "") => ({ nome, marca, qtd, preco, unidade: "un" });

describe("conferencia carrinho x nota", () => {
  it("explica a diferenca: esquecidos, precos e nao cobrados", () => {
    const r = conferir(
      [c("arroz", 25), c("leite italac", 5.5, 6), c("cafe", 18.9), c("detergente", 2.5)],
      [n("arroz", 27.9), n("leite", 5.5, 6, "Italac"), n("café", 18.9), n("sabão em pó", 22.9), n("banana", 6.99, 0.8)],
    );
    expect(r.iguais.map((p) => p.c.name)).toEqual(["leite italac", "cafe"]);
    expect(r.diferentes).toMatchObject([{ c: { name: "arroz" }, dif: 2.9 }]);
    expect(r.soNaNota.map((x) => x.nome)).toEqual(["sabão em pó", "banana"]);
    expect(r.soNoCarrinho.map((x) => x.name)).toEqual(["detergente"]);
    expect(r.partes).toEqual({ esquecidos: 28.49, diferencas: 2.9, naoCobrados: 2.5 });
    // a conta fecha: nota = carrinho + esquecidos + diferencas - nao cobrados
    expect(+(r.totalCarrinho + r.partes.esquecidos + r.partes.diferencas - r.partes.naoCobrados).toFixed(2)).toBe(r.totalNota);
  });

  it("duas marcas do mesmo produto: casa pelo valor mais perto", () => {
    const r = conferir([c("arroz tio joao", 30), c("arroz camil", 22)], [n("arroz", 22), n("arroz", 30)]);
    expect(r.iguais).toHaveLength(2);
    expect(r.soNaNota).toHaveLength(0);
  });

  it("total impresso na nota vale mais que a soma das linhas", () => {
    expect(conferir([c("arroz", 10)], [n("arroz", 10)], 9.5).totalNota).toBe(9.5);
  });
});
