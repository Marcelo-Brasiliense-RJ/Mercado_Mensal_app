import { describe, expect, it } from "vitest";
import { diaDaSemana, diaMes, estadoNota, rotuloOrigem } from "./compras";

describe("compras do mes", () => {
  it("data curta e dia da semana sem fuso", () => {
    expect(diaMes("2026-11-07")).toBe("07/11");
    expect(diaDaSemana("2026-11-11")).toBe("qua");
    expect(diaDaSemana("2026-11-07")).toBe("sáb");
  });

  it("nome da compra: mercado quando tem, senao a origem", () => {
    expect(rotuloOrigem({ origem: "carrinho", mercado: "Guanabara", itens: 51 })).toBe("Guanabara");
    expect(rotuloOrigem({ origem: "carrinho", mercado: null, itens: 51 })).toBe("No mercado");
    expect(rotuloOrigem({ origem: "avulsa", mercado: null, itens: 1 })).toBe("Item avulso");
  });

  it("estado da nota", () => {
    expect(estadoNota({ tem_nota: true, pendente: false, sem_nota_ok: false })).toBe("com_nota");
    expect(estadoNota({ tem_nota: false, pendente: true, sem_nota_ok: false })).toBe("pendente");
    expect(estadoNota({ tem_nota: false, pendente: false, sem_nota_ok: true })).toBe("sem_nota");
  });
});
