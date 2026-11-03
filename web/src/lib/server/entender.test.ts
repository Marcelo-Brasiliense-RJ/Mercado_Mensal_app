import { afterEach, describe, expect, it, vi } from "vitest";
import { entenderTexto } from "./entender";

describe("cerebro compartilhado (texto digitado, voz pelo celular)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sem chave de IA, a regra local entende a mesma frase do audio", async () => {
    for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"]) vi.stubEnv(k, "");
    const e = await entenderTexto("tenho 5 quilos de arroz, mas não precisa comprar leite, já tem muito fermento");
    expect(e.por).toBe("regra");
    expect(e.itens.map((i) => [i.nome, i.remover ? `remover:${i.motivo ?? "?"}` : i.destino])).toEqual([
      ["arroz", "estoque"],
      ["leite", "remover:?"],
      ["fermento", "remover:excesso"],
    ]);
  });

  it("com Gemini, usa a resposta da IA", async () => {
    for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"]) vi.stubEnv(k, "");
    vi.stubEnv("GEMINI_API_KEY", "k");
    const resposta = {
      intencao: "lista",
      itens: [{ nome: "café", qtd: 2, unidade: "un", acao: "lista" }, { nome: "leite", acao: "remover", motivo: "excesso" }],
    };
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(resposta) }] } }] })),
    );
    const e = await entenderTexto("anota 2 cafés e não compra leite que tem demais", "lista");
    expect(e.por).toBe("gemini");
    expect(e.itens).toMatchObject([
      { nome: "café", qtd: 2, destino: "lista" },
      { nome: "leite", remover: true, motivo: "excesso" },
    ]);
    // a tela vai junto para a IA desempatar
    expect(String((f.mock.calls[0][1] as RequestInit).body)).toContain("montando a LISTA");
    f.mockRestore();
  });
});
