import { describe, expect, it } from "vitest";
import { inserirNaOrdem, ondeFica, prova, sugerirProdutos } from "./faltaNaNota";

describe("falta na nota", () => {
  const un = (qtd: number) => ({ qtd, unidade: "un" });
  it("45 de 46 = 97% (nunca 100 sem bater); 46 de 46 = 100", () => {
    expect(prova([un(44), un(1)], 46)).toMatchObject({ lidos: 45, noCupom: 46, pct: 97, falta: 1, sobra: 0 });
    expect(prova([un(45), un(1)], 46)?.pct).toBe(100);
    expect(prova([un(47)], 46)).toMatchObject({ falta: 0, sobra: 1, pct: 99 });
    expect(prova([un(1)], 0)).toBeNull();
  });
  it("Guanabara conta LINHAS (110 linhas, 12 cocas numa): os numeros que nao vieram sao os que faltam", () => {
    const linhas = Array.from({ length: 110 }, (_, k) => ({ qtd: k === 74 ? 12 : 1, unidade: "un", n: k + 1 })).filter((l) => l.n !== 57);
    expect(prova(linhas, 110)).toMatchObject({ lidos: 109, falta: 1, sobra: 0, porLinha: true, semNumero: [57] });
    expect(prova([...linhas, { qtd: 1, unidade: "un", n: 57 }], 110)).toMatchObject({ lidos: 110, pct: 100 });
  });
  it("onde fica e inserir na ordem do cupom", () => {
    const l = [{ nome: "esponja" }, { nome: "sapolio" }];
    expect(ondeFica(l, 1)).toEqual({ acima: "esponja", abaixo: "sapolio" });
    expect(ondeFica(l, 0)).toEqual({ acima: "", abaixo: "esponja" });
    expect(ondeFica(l, 2)).toEqual({ acima: "sapolio", abaixo: "" });
    expect(inserirNaOrdem(l, { nome: "x" }, 1).map((i) => i.nome)).toEqual(["esponja", "x", "sapolio"]);
  });
  it("sugere produto da casa pelo que digita, sem acento", () => {
    const p = [{ name: "Sabão em pó" }, { name: "Desinfetante Búfalo" }, { name: "sabonete" }, { name: "Arroz" }];
    expect(sugerirProdutos("sab", p).map((x) => x.name)).toEqual(["sabonete", "Sabão em pó"]);
    expect(sugerirProdutos("bufalo", p).map((x) => x.name)).toEqual(["Desinfetante Búfalo"]);
    expect(sugerirProdutos("a", p)).toEqual([]);
  });
});
