import { describe, expect, it } from "vitest";
import { agrupar, textoAviso } from "./avisos";

describe("avisos da familia", () => {
  it("monta o texto de cada tipo", () => {
    expect(textoAviso("Bianca", { tipo: "lista", nomes: ["café", "pão"] })).toMatchObject({ title: "📝 Bianca pôs na lista", body: "café, pão" });
    expect(textoAviso("Bianca", { tipo: "lista", nomes: ["a", "b", "c", "d", "e"] }).body).toBe("a, b, c e mais 2");
    expect(textoAviso("Cláudio", { tipo: "acabou", nomes: ["arroz"] }).body).toBe("arroz · avisado por Cláudio");
    expect(textoAviso("Marcelo", { tipo: "mercado", nomes: [] }).title).toBe("🛒 Marcelo está no mercado");
    expect(textoAviso("Marcelo", { tipo: "compra", nomes: [], total: 312.4, itens: 38 }).body).toMatch(/312,40 · 38 itens/);
  });
  it("junta avisos seguidos do mesmo tipo", () => {
    const r = agrupar([
      { tipo: "lista", nomes: ["café"] },
      { tipo: "lista", nomes: ["pão"] },
      { tipo: "acabou", nomes: ["arroz"] },
      { tipo: "lista", nomes: ["leite"] },
    ]);
    expect(r).toEqual([
      { tipo: "lista", nomes: ["café", "pão", "leite"] },
      { tipo: "acabou", nomes: ["arroz"] },
    ]);
  });
});
