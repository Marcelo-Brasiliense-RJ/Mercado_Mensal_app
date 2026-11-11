import { describe, expect, it } from "vitest";
import { avisoNovos, novosNaLista } from "./store";
import type { ShopItem } from "./types";

const item = (name: string, status: ShopItem["status"] = "pending"): ShopItem => ({
  id: name,
  name,
  desired_quantity: 1,
  unit: "un",
  estimated_price: null,
  status,
});

describe("lista dividida com a familia", () => {
  it("avisa so o que entrou pendente e nao estava antes (por nome)", () => {
    const antes = [item("Arroz"), item("Café", "bought")];
    const depois = [item("arroz"), item("Café"), item("Pão"), item("Leite", "bought")];
    expect(novosNaLista(antes, depois)).toEqual(["Café", "Pão"]);
  });

  it("nada novo, nada de aviso", () => {
    expect(novosNaLista([item("Arroz")], [item("Arroz")])).toEqual([]);
  });

  it("aviso curto mesmo com muitos itens", () => {
    expect(avisoNovos(["café", "pão"])).toBe("👨‍👩‍👧 Na lista agora: café, pão");
    expect(avisoNovos(["a", "b", "c", "d", "e"])).toBe("👨‍👩‍👧 Na lista agora: a, b, c e mais 2");
  });
});
