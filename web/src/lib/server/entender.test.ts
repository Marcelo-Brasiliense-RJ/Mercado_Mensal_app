import { afterEach, describe, expect, it, vi } from "vitest";
import { entenderTexto, pareceReceita } from "./entender";

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

describe("receita vira lista", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reconhece receita colada, so ingredientes ou so o nome do prato", () => {
    expect(pareceReceita("Bolo de cenoura\nIngredientes\n3 cenouras\n4 ovos\nModo de preparo: bata tudo")).toBe(true);
    expect(pareceReceita("2 xícaras de farinha\n1 lata de leite condensado\n200 g de queijo")).toBe(true);
    expect(pareceReceita("receita de lasanha pra 6 pessoas")).toBe(true);
    expect(pareceReceita("preciso de café e 2 leites")).toBe(false);
    expect(pareceReceita("tenho 5 kg de arroz")).toBe(false);
  });

  it("manda a instrucao de receita para a IA no lugar do contexto da tela", async () => {
    for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"]) vi.stubEnv(k, "");
    vi.stubEnv("GEMINI_API_KEY", "k");
    const resposta = { intencao: "lista", itens: [{ nome: "farinha de trigo", qtd: 1, unidade: "pct", acao: "lista" }] };
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(resposta) }] } }] })),
    );
    const e = await entenderTexto("receita de bolo simples", "estoque");
    const corpo = String((f.mock.calls[0][1] as RequestInit).body);
    expect(corpo).toContain("RECEITA:");
    expect(corpo).not.toContain("tela do ESTOQUE");
    expect(e.itens).toMatchObject([{ nome: "farinha de trigo", destino: "lista" }]);
    f.mockRestore();
  });
});
