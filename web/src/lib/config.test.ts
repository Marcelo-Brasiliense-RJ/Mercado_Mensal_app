import { describe, it, expect } from "vitest";
import { familyCanUseQr } from "./config";

// QR desativado por ora (QR_FAMILIAS vazio): ninguem ve o botao. Quando reativar
// por familia, este teste deve refletir a allowlist.
describe("familyCanUseQr (gate do import por QR)", () => {
  it("desativado para todas as familias enquanto a allowlist estiver vazia", () => {
    expect(familyCanUseQr("Brasiliense")).toBe(false);
    expect(familyCanUseQr("Casa Brasiliense")).toBe(false);
    expect(familyCanUseQr("Silva")).toBe(false);
  });

  it("trata valores vazios sem quebrar", () => {
    expect(familyCanUseQr("")).toBe(false);
    expect(familyCanUseQr(null)).toBe(false);
    expect(familyCanUseQr(undefined)).toBe(false);
  });
});
