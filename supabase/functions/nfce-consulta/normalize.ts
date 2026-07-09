// Normalizacao das descricoes fiscais para nome generico + marca, via Groq.
// Os numeros (qtd, preco, unidade) vem da SEFAZ e NAO passam por LLM.

import type { NfceItem } from "./parse.ts";

export type NormItem = {
  nome: string;
  marca: string;
  qtd: number;
  preco: number;
  unidade: string;
  desc_fiscal: string;
};

const MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";

const SYS = `Voce normaliza descricoes fiscais de cupom (NFC-e) brasileiras.
Para cada descricao, devolva o NOME GENERICO do produto (minusculo, sem marca,
sem gramatura) e a MARCA (minusculo, "" se nao houver).
Exemplos:
"CRE DEN COLGATE TRI AC XT" -> nome "creme dental", marca "colgate"
"ABS INTIMUS NAT EXP" -> nome "absorvente", marca "intimus"
"SABONETE FRANCIS BRAS L DOCE" -> nome "sabonete", marca "francis"
Responda SOMENTE um JSON: {"itens":[{"i":0,"nome":"...","marca":"..."}, ...]}`;

export async function normalizeItems(itens: NfceItem[], apiKey: string): Promise<NormItem[]> {
  if (itens.length === 0) return [];
  const lista = itens.map((it, i) => `${i}: ${it.desc_fiscal}`).join("\n");

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: lista },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`groq_${resp.status}`);
  const data = await resp.json();
  let parsed: { itens?: { i: number; nome: string; marca: string }[] } = {};
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }
  const byIndex = new Map((parsed.itens ?? []).map((x) => [x.i, x]));

  return itens.map((it, i) => {
    const n = byIndex.get(i);
    return {
      nome: (n?.nome ?? it.desc_fiscal).toLowerCase().trim(),
      marca: (n?.marca ?? "").toLowerCase().trim(),
      qtd: it.qtd,
      preco: it.preco,
      unidade: it.unidade,
      desc_fiscal: it.desc_fiscal,
    };
  });
}
