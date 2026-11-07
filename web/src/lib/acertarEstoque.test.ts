import { describe, expect, it } from "vitest";
import { acertarEstoque, linhasDePara } from "./acertarEstoque";
import type { StockItem } from "./types";

const item = (name: string, current: number, unit: string): StockItem => ({
  id: name, name, category: "", unit, current, normal: 0, priceLast: null, priceAvg: null, trend: 0,
});
const stock = [item("Arroz", 3, "kg"), item("Leite", 2, "L")];

describe("atualizar estoque: de -> para", () => {
  it("acha o DE no estoque e usa nome e unidade de la", () => {
    expect(linhasDePara([{ nome: "arroz", qtd: 5, unidade: "un" }], stock)).toEqual([
      { nome: "Arroz", de: 3, para: 5, unidade: "kg" },
    ]);
  });

  it("produto novo vem sem DE", () => {
    expect(linhasDePara([{ nome: "café", qtd: 2, unidade: "pct" }], stock)).toEqual([
      { nome: "café", de: null, para: 2, unidade: "pct" },
    ]);
  });

  it("falou duas vezes, vale a ultima; 'estoque' nao e produto", () => {
    const r = linhasDePara(
      [
        { nome: "estoque", qtd: 1, unidade: "un" },
        { nome: "leite", qtd: 1, unidade: "un" },
        { nome: "leites", qtd: 4, unidade: "un" },
      ],
      stock,
    );
    expect(r).toEqual([{ nome: "Leite", de: 2, para: 4, unidade: "L" }]);
  });

  it("grava a diferenca (fica X, nao soma X)", async () => {
    const enviados: { name: string; qty: number }[] = [];
    await acertarEstoque([{ nome: "Arroz", qtd: 5, unidade: "kg" }, { nome: "Leite", qtd: 0, unidade: "L" }], stock, async (i) => {
      enviados.push({ name: i.name, qty: i.qty });
      return { ok: true } as never;
    });
    expect(enviados).toEqual([{ name: "Arroz", qty: 2 }, { name: "Leite", qty: -2 }]);
  });
});
