import { describe, expect, it } from "vitest";
import { linkGoogle, ordenar, planejar } from "./rota";
import type { Oferta } from "./ofertas";

let id = 0;
const of = (produto: string, mercado: string, preco_por: number): Oferta => ({
  id: ++id, mercado, produto, marca: "", tamanho: "", categoria: "Mercearia",
  preco_por, preco_de: null, condicao: null, fim: null, tem_foto: false,
});

const ofertas = [
  of("Arroz", "guanabara", 20), of("Arroz", "mundial", 22),
  of("Feijão", "guanabara", 8), of("Feijão", "mundial", 7.5),
  of("Carne Acém", "mundial", 30), of("Carne Acém", "guanabara", 45),
  of("Café", "superbom", 14),
];

describe("planejar rota", () => {
  it("1 mercado: o que tem mais itens e sai mais barato", () => {
    const p = planejar(["arroz", "feijao", "carne"], ofertas, ["guanabara", "mundial"], 1)!;
    expect(p.paradas.map((x) => x.mercado)).toEqual(["mundial"]);
    expect(p.total).toBeCloseTo(59.5);
  });
  it("2 mercados so se valer a pena (R$ 10 a menos ou item a mais)", () => {
    // guanabara+mundial: arroz 20 + feijao 7,5 + carne 30 = 57,5: so R$ 2 a menos que o Mundial sozinho
    const p = planejar(["arroz", "feijao", "carne"], ofertas, ["guanabara", "mundial"], 2)!;
    expect(p.paradas).toHaveLength(1);
    // com cafe na lista, o Superbom entra porque traz item que faltava
    const q = planejar(["arroz", "feijao", "carne", "cafe"], ofertas, ["guanabara", "mundial", "superbom"], 2)!;
    expect(q.paradas.map((x) => x.mercado).sort()).toEqual(["mundial", "superbom"]);
    expect(q.faltam).toEqual([]);
  });
  it("ordem pela distancia e link do Google com paradas", () => {
    const casa = { lat: 0, lng: 0 };
    const r = ordenar(casa, [{ lat: 0, lng: 0.05, n: "longe" }, { lat: 0, lng: 0.01, n: "perto" }]);
    expect(r.map((x) => x.n)).toEqual(["perto", "longe"]);
    const url = linkGoogle(casa, r);
    expect(url).toContain("destination=0.000000%2C0.050000");
    expect(url).toContain("waypoints=0.000000%2C0.010000");
  });
});
