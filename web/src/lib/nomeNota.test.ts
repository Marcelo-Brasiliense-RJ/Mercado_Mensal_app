import { describe, expect, it } from "vitest";
import { limparNome } from "./nomeNota";

describe("nome da nota sem abreviacao (prints do dono, 2026-11-12)", () => {
  it.each([
    ["Ling", "linguiça"],
    ["Sab Liq", "sabonete líquido"],
    ["Temper", "tempero"],
    ["Iog", "iogurte"],
    ["Norango", "morango"],
    ["Cre Den Oral B", "creme dental"],
    ["Cha", "chá"],
    ["Oleo De Soja", "óleo de soja"],
    ["Agua Sanitaria", "água sanitária"],
    ["Xarope Guarana", "xarope guaraná"],
    ["Tira Manch", "tira manchas"],
  ])("%s -> %s", (de, para) => expect(limparNome(de)).toBe(para));

  it.each([
    ["LING TIPO CALABRESA PERDIGAO KG", "linguiça tipo calabresa"],
    ["SAB LIQ COALA HOME FRUTAS VER 500ML", "sabonete líquido coala home"],
    ["IOG VIGOR GREGO MORANGO 90G", "iogurte grego morango"],
    ["CRE DEN ORAL B 3D WHITE BRIL FR 70G", "creme dental white bril"],
    ["TIRA MANC TIXAN YPE PO R BC SAC380G", "tira manchas pó"],
    ["MAC INST NISSIN LAMEN GC 85GC/6L+P-", "macarrão instantâneo nissin lamen"],
    ["QUE MUC BUF DOURADO SORO PT 200G", "queijo muçarela buf dourado"],
    ["OVOS BCOS CASBRI EXT FILMAD BD C/30", "ovos"],
  ])("linha do cupom %s -> %s", (de, para) => expect(limparNome(de)).toBe(para));

  it("o nome que a casa ja usa vence (um historico so por produto)", () => {
    expect(limparNome("Cha", ["Chá"])).toBe("Chá");
    expect(limparNome("Oleo De Soja", ["óleo de soja"])).toBe("óleo de soja");
  });
  it("nao estraga nome bom parecido com outro", () => {
    expect(limparNome("pessego em calda")).toBe("pêssego em calda");
    expect(limparNome("costelinha suina")).toBe("costelinha suína");
    expect(limparNome("petiscos para gato")).toBe("petiscos para gato");
    expect(limparNome("macarrao instantaneo")).toBe("macarrão instantâneo");
  });
  it("nome bom fica igual", () => {
    expect(limparNome("arroz")).toBe("arroz");
    expect(limparNome("papel higiênico")).toBe("papel higiênico");
    expect(limparNome("batata palha")).toBe("batata palha");
    expect(limparNome("cebola")).toBe("cebola");
  });
});
