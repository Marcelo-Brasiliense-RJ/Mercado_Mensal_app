import { describe, expect, it } from "vitest";
import { fimCampanha, melhorOnline } from "./lojasOnline";

describe("melhor loja online", () => {
  it("mesmo preco: ganha a que da mais pontos", () => {
    const m = melhorOnline(
      [
        { loja: "ECO", preco: 10, pts: 1 },
        { loja: "CRM", preco: 10, pts: 3 },
      ],
      0.03,
    );
    expect(m?.loja).toBe("CRM");
  });
  it("mais barato no caixa ganha se os pontos nao compensam", () => {
    const m = melhorOnline(
      [
        { loja: "CRM", preco: 12, pts: 3 },
        { loja: "DPC", preco: 9, pts: 1 },
      ],
      0.03,
    );
    expect(m?.loja).toBe("DPC");
  });
  it("sem nada: null", () => expect(melhorOnline([], 0.03)).toBeNull());
});

describe("fim da campanha", () => {
  it("pega a ultima data", () => {
    expect(fimCampanha("Campanha válida de 03 a 05/11/2026. Ganhe 3 pontos")).toBe("05/11");
    expect(fimCampanha("Consulte o regulamento")).toBeNull();
    expect(fimCampanha(null)).toBeNull();
  });
});
