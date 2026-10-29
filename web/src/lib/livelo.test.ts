import { describe, expect, it } from "vitest";
import { comparar, liquido, ofertasLivelo, ptsCertos, type Livelo, type Paridade } from "./livelo";
import type { Oferta } from "./ofertas";

const par = (p: Partial<Paridade>): Paridade => ({
  codigo: "CRM", nome: "Carrefour Mercado", pontos: 4, pontos_clube: 4, pontos_normal: 4,
  promocao: false, ate: false, regra: null, atualizado_em: "2026-10-29T00:00:00Z", ...p,
});
const casa = (p: Partial<Livelo> = {}): Livelo => ({
  configurado: true, valor_ponto: 0.03, clube: false, parceiros: ["CRM"], paridades: [par({})],
  fixos: ["cafe pilao"], precos: [{ item: "cafe pilao", parceiro: "CRM", preco: 19.2, visto_em: "2026-10-29T00:00:00Z" }],
  mes: { pontos: 0, gasto: 0, compras: 0 }, por_parceiro: [], ...p,
});
const oferta = (preco: number): Oferta => ({
  id: 1, mercado: "guanabara", produto: "Café Pilão 500g", marca: "Pilão", tamanho: "500g", categoria: "Mercearia",
  preco_por: preco, preco_de: null, condicao: null, fim: null, tem_foto: false,
});

describe("livelo", () => {
  it("preço líquido desconta os pontos", () => {
    expect(liquido(100, 4, 0.03)).toBeCloseTo(88);
  });

  it("campanha 'até' conta só os pontos garantidos", () => {
    expect(ptsCertos(par({ pontos: 7, pontos_normal: 1, ate: true }), false)).toBe(1);
    expect(ptsCertos(par({ pontos: 2, pontos_clube: 4 }), true)).toBe(4);
  });

  it("Livelo vence quando, com pontos, sai mais barato que o encarte", () => {
    const c = comparar("cafe pilao", [oferta(18.9)], casa());
    expect(c.vence).toBe("livelo"); // 19,20 - 77 pts x 0,03 = 16,89
    expect(c.livelo?.pts).toBe(77);
    expect(c.diferenca).toBeCloseTo(18.9 - (19.2 - 77 * 0.03));
  });

  it("encarte vence quando a promoção é forte", () => {
    expect(comparar("cafe pilao", [oferta(12.9)], casa()).vence).toBe("mercado");
  });

  it("parceiro que a casa não usa não entra", () => {
    const c = comparar("cafe pilao", [oferta(18.9)], casa({ parceiros: [] }));
    expect(c.livelo).toBeNull();
    expect(ofertasLivelo(casa({ parceiros: [] }))).toEqual([]);
  });

  it("vira oferta de um mercado a mais para a Lista", () => {
    const [o] = ofertasLivelo(casa());
    expect(o).toMatchObject({ mercado: "livelo:CRM", produto: "cafe pilao", preco_de: 19.2 });
    expect(o.preco_por).toBeCloseTo(19.2 - 77 * 0.03, 2); // 77 pts inteiros
    expect(o.condicao).toBe("+77 pts Livelo");
  });
});
