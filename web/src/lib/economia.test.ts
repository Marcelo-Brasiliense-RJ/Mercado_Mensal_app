import { describe, expect, it } from "vitest";
import { agrupar, deCostume, emOutroMercado, porCategoria, ritmo, somarMes, type CompraMes } from "./economia";
import type { Oferta } from "./ofertas";

let id = 0;
const c = (name: string, qty: number, price: number, unit = "un"): CompraMes => ({
  id: String(++id), name, qty, unit, price, total: qty * price, at: "2026-10-05",
});
const of = (o: Partial<Oferta>): Oferta => ({
  id: ++id, mercado: "guanabara", produto: "", marca: "", tamanho: "", categoria: "Mercearia",
  preco_por: 1, preco_de: null, condicao: null, fim: null, tem_foto: false, ...o,
});

const itens = agrupar([c("Arroz", 1, 22.9), c("arroz", 1, 21.1), c("detergente", 3, 2.5), c("cafe", 1, 15)]);

describe("economia do mes", () => {
  it("agrupa o mesmo item e ordena pelo que mais pesou", () => {
    expect(itens.map((i) => [i.nome, i.qty, i.total])).toEqual([["Arroz", 2, 44], ["cafe", 1, 15], ["detergente", 3, 7.5]]);
    expect(itens[0].preco).toBe(22);
  });
  it("por categoria", () => {
    expect(porCategoria(itens).map((g) => g.categoria)).toEqual(["Mercearia", "Limpeza"]);
  });
  it("outro mercado: economia vezes a quantidade, por mercado", () => {
    const r = emOutroMercado(itens, [
      of({ produto: "Arroz Rei do Sul", preco_por: 14.95, mercado: "guanabara" }),
      of({ produto: "Detergente Ypê", preco_por: 1.99, mercado: "mundial" }),
      of({ produto: "Café Pilão", preco_por: 16, mercado: "mundial" }), // mais caro: fora
    ]);
    const outro = emOutroMercado(itens, [of({ produto: "Café Pilão 50g", preco_por: 3 })]);
    expect(outro.total).toBe(0); // 3 contra 15 pagos: embalagem diferente, nao economia
    expect(r.total).toBeCloseTo((22 - 14.95) * 2 + (2.5 - 1.99) * 3);
    expect(r.mercados.map((m) => m.mercado)).toEqual(["guanabara", "mundial"]);
  });
  it("de costume: abaixo e acima da media", () => {
    const r = deCostume(itens, [{ name: "arroz", media: 25, vezes: 3 }, { name: "cafe", media: 12, vezes: 2 }, { name: "detergente", media: 2.52, vezes: 1 }]);
    expect(r.economizou).toBeCloseTo(6);
    expect(r.pagouAMais).toBeCloseTo(3);
    expect(r.abaixo.length + r.acima.length).toBe(2); // detergente: diferenca minima
  });
  it("ritmo e meses", () => {
    expect(ritmo(600, 1000, new Date(2026, 9, 25))).toEqual({ dias: 7, sobra: 400, porSemana: 400 });
    expect(ritmo(600, null)).toBeNull();
    expect(somarMes("2026-01-01", -1)).toBe("2025-12-01");
  });
});
