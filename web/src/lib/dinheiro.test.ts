import { describe, expect, it } from "vitest";
import { dinheiroCampo, mascaraDinheiro } from "./dinheiro";

describe("campo de dinheiro sem virgula", () => {
  it("digitos entram pelos centavos", () => {
    expect(mascaraDinheiro("1")).toBe("0,01");
    expect(mascaraDinheiro("17")).toBe("0,17");
    expect(mascaraDinheiro("1700")).toBe("17,00");
    expect(mascaraDinheiro("123456")).toBe("1234,56");
  });
  it("continua digitando sobre o valor ja formatado", () => {
    expect(mascaraDinheiro("6,205")).toBe("62,05");
    expect(mascaraDinheiro("0,0")).toBe("");
    expect(mascaraDinheiro("62,0")).toBe("6,20"); // apagou o ultimo digito
    expect(mascaraDinheiro("R$ 5,9a")).toBe("0,59");
  });
  it("valor existente vira texto do campo", () => {
    expect(dinheiroCampo(6.2)).toBe("6,20");
    expect(dinheiroCampo("18.9")).toBe("18,90");
    expect(dinheiroCampo(null)).toBe("");
    expect(dinheiroCampo(0)).toBe("");
  });
});
