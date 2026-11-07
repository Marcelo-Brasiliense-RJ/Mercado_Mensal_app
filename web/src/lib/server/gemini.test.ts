import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Resposta falsa do Google por modelo: 429 com retryDelay, 503 (sobrecarga) ou 200.
const r429 = (s: number) =>
  new Response(JSON.stringify({ error: { details: [{ retryDelay: `${s}s` }] } }), { status: 429 });
const r503 = () => new Response("{}", { status: 503 });
const r200 = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });

async function chamar(porModelo: (m: string) => Response) {
  vi.resetModules(); // descanso das chaves zerado a cada caso
  vi.stubGlobal("fetch", vi.fn(async (url: string) => porModelo(String(url).match(/models\/([^:]+)/)![1])));
  const { gemini } = await import("./gemini");
  return gemini({}, false, 1000, undefined, ["lite", "forte"]);
}

describe("gemini: limite x falha passageira", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "a";
    process.env.GEMINI_API_KEY_2 = "b";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("caso do uso real: lite sobrecarregado e forte sem cota do dia NAO e 'volta em 16 h'", async () => {
    const r = await chamar((m) => (m === "lite" ? r503() : r429(59047)));
    expect(r).toEqual({ ok: false, erro: "ia_falhou" });
  });

  it("todas as opcoes no limite: limite com a menor espera", async () => {
    const r = await chamar((m) => (m === "lite" ? r429(40) : r429(59047)));
    expect(r.ok).toBe(false);
    if (!r.ok && r.erro === "limite") expect(r.espera).toBe(41);
    else throw new Error("esperava limite");
  });

  it("um modelo sem cota e outro funcionando: responde", async () => {
    const r = await chamar((m) => (m === "lite" ? r429(59047) : r200()));
    expect(r).toEqual({ ok: true, texto: "ok" });
  });
});
