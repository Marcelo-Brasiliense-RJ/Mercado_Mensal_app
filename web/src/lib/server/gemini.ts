// Chamada ao Gemini com rodizio de chaves (GEMINI_API_KEY, _2, _3...) e modelos "lite"
// na frente. Saiu da rota de foto para a foto da despensa usar a mesma: as duas
// dividem a cota e o descanso de cada chave.
// So no servidor: a chave nunca chega ao navegador.

const MODELOS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-3.5-flash"];

// Estado do rodizio, por instancia do servidor (melhor esforco: outra instancia comeca
// do zero e no maximo leva um 429 a mais, que tambem e respeitado).
let vez = 0;
const descanso = new Map<string, number>(); // "modelo|chave" -> livre a partir de (ms)

// O 429 do Gemini diz quanto esperar (RetryInfo.retryDelay, ex.: "23s").
async function pausaPedida(r: Response): Promise<number | null> {
  try {
    const j = (await r.json()) as { error?: { details?: { retryDelay?: string }[] } };
    const d = j.error?.details?.find((x) => x.retryDelay)?.retryDelay;
    const s = d ? parseFloat(d) : NaN;
    return Number.isFinite(s) ? Math.ceil(s * 1000) + 1000 : null;
  } catch {
    return null;
  }
}

export function chavesGemini(): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(process.env)) if (/^GEMINI_API_KEY(_\d+)?$/.test(k) && v) out.push(v);
  return out.sort();
}

export type RespostaGemini = { ok: true; texto: string } | { ok: false; erro: "limite"; espera: number } | { ok: false; erro: "ia_falhou" | "ia_indisponivel" };

// corpo: o JSON do generateContent. forte: modelo mais forte na frente.
export async function gemini(corpo: unknown, forte = false, timeoutMs = 20000): Promise<RespostaGemini> {
  const ks = chavesGemini();
  if (!ks.length) return { ok: false, erro: "ia_indisponivel" };
  const body = JSON.stringify(corpo);
  // Rodizio: cada pedido comeca numa chave diferente (a cota se espalha) e a chave que
  // levou 429 descansa o tempo que o Google pediu, por modelo.
  const inicio = vez++ % ks.length;
  let espera = Infinity;
  for (const modelo of forte ? [...MODELOS].reverse() : MODELOS) {
    for (let n = 0; n < ks.length; n++) {
      const i = (inicio + n) % ks.length;
      const id = `${modelo}|${i}`;
      const livre = descanso.get(id) ?? 0;
      if (livre > Date.now()) {
        espera = Math.min(espera, livre - Date.now());
        continue;
      }
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": ks[i] },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (r.status === 429) {
          const ms = (await pausaPedida(r)) ?? 60_000;
          descanso.set(id, Date.now() + ms);
          espera = Math.min(espera, ms);
          continue; // cota desta chave neste modelo: a proxima
        }
        if (r.status === 403) {
          descanso.set(id, Date.now() + 3_600_000); // chave sem permissao: fora por 1 h
          continue;
        }
        if (r.status === 404 || r.status >= 500) break; // modelo fora: tenta o proximo
        if (!r.ok) continue;
        const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const txt = j.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) return { ok: true, texto: txt };
      } catch {
        // rede ou resposta quebrada: tenta a proxima chave
      }
    }
  }
  if (espera < Infinity) return { ok: false, erro: "limite", espera: Math.max(5, Math.ceil(espera / 1000)) };
  return { ok: false, erro: "ia_falhou" };
}
