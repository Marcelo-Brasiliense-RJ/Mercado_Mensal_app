import { describe, expect, it } from "vitest";
import { corredorAtual, montarMercado, parecido } from "./modoMercado";
import type { ShopItem, TripItem } from "./types";

const li = (id: string, name: string, preco: number | null = null, status: ShopItem["status"] = "pending"): ShopItem => ({
  id, name, desired_quantity: 1, unit: "un", estimated_price: preco, status,
});
const ti = (id: string, name: string, preco: number, q = 1): TripItem => ({
  id, name, quantity: q, unit: "un", unit_price: preco, above_par: false,
});
const cat = (n: string) =>
  /desinfetante|detergente|sab/i.test(n) ? "Limpeza" : /arroz|feij/i.test(n) ? "Mercearia" : "Outros";

describe("montarMercado", () => {
  it("separa por categoria o que foi pego, o que falta e soma os valores", () => {
    const r = montarMercado(
      [li("1", "Arroz", 25), li("2", "Feijão", 8), li("3", "Detergente", 3), li("4", "Velho", 1, "bought")],
      [ti("a", "arroz", 24, 2), ti("b", "Sabão em pó", 18)],
      cat,
    );
    const merc = r.grupos.find((g) => g.categoria === "Mercearia")!;
    expect(merc.pegos.map((p) => p.item.name)).toEqual(["Arroz"]);
    expect(merc.faltam.map((f) => f.name)).toEqual(["Feijão"]);
    expect(merc.total).toBe(48);
    expect(merc.falta).toBe(8);
    const limp = r.grupos.find((g) => g.categoria === "Limpeza")!;
    expect(limp.foraDaLista.map((t) => t.name)).toEqual(["Sabão em pó"]);
    expect(r.totalLista).toBe(3); // o ja comprado fora da compra nao conta
    expect(r.pegosLista).toBe(1);
    expect(r.faltaValor).toBe(11);
  });

  it("pergunta se e o mesmo quando pegou um parecido da mesma categoria", () => {
    const r = montarMercado([li("1", "Desinfetante Veja")], [ti("a", "Desinfetante Pinho Sol", 9)], cat);
    expect(r.sugestoes).toHaveLength(1);
    expect(r.sugestoes[0].lista.id).toBe("1");
  });

  it("nao sugere entre categorias nem tipos diferentes", () => {
    const r = montarMercado([li("1", "Detergente"), li("2", "Feijão")], [ti("a", "Sabão em pó", 18)], cat);
    expect(r.sugestoes).toHaveLength(0);
  });

  it("troca confirmada conta como pego e some das sugestoes", () => {
    const r = montarMercado(
      [li("1", "Desinfetante Veja")],
      [ti("a", "Desinfetante Pinho Sol", 9)],
      cat,
      { "1": "Desinfetante Pinho Sol" },
    );
    expect(r.pegosLista).toBe(1);
    expect(r.sugestoes).toHaveLength(0);
    expect(r.grupos[0].pegos[0].trocadoPor).toBe("Desinfetante Pinho Sol");
    expect(r.grupos[0].foraDaLista).toHaveLength(0);
  });
});

describe("parecido / corredorAtual", () => {
  it("mesmo tipo de produto e parecido; nome igual nao", () => {
    expect(parecido("desinfetante veja", "desinfetante pinho")).toBe(true);
    expect(parecido("arroz", "Arroz")).toBe(false);
    expect(parecido("arroz", "feijao")).toBe(false);
  });
  it("corredor e a categoria do ultimo pego", () => {
    expect(corredorAtual([ti("a", "arroz", 1), ti("b", "detergente", 1)], cat)).toBe("Limpeza");
    expect(corredorAtual([], cat)).toBeNull();
  });
});
