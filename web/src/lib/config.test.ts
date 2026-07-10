import { describe, it, expect } from "vitest";
import { familyCanUseQr } from "./config";

describe("familyCanUseQr (gate do import por QR)", () => {
  it("libera a familia Brasiliense (variacoes de caixa/acento/prefixo)", () => {
    expect(familyCanUseQr("Brasiliense")).toBe(true);
    expect(familyCanUseQr("brasiliense")).toBe(true);
    expect(familyCanUseQr("Casa Brasiliense")).toBe(true);
    expect(familyCanUseQr("Família Brasiliense")).toBe(true);
  });

  it("bloqueia outras familias e valores vazios", () => {
    expect(familyCanUseQr("Silva")).toBe(false);
    expect(familyCanUseQr("")).toBe(false);
    expect(familyCanUseQr(null)).toBe(false);
    expect(familyCanUseQr(undefined)).toBe(false);
  });
});
