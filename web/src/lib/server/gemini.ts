// Chamada ao Gemini com rodizio de chaves (GEMINI_API_KEY, _2, _3...) e modelos "lite"
// na frente. Saiu da rota de foto para a foto da despensa usar a mesma: as duas
// dividem a cota e o descanso de cada chave.
// So no servidor: a chave nunca chega ao navegador.

// gemini-2.5-flash-lite saiu (404 nas tres chaves, conferido em 2026-11-04).
const MODELOS = ["gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-3.5-flash"];

// Estado do rodizio, por instancia do servidor (melhor esforco: outra instancia comeca
// do zero e no maximo leva um 429 a mais, que tambem e respeitado).
let vez = 0;
const descanso = new Map<string, number>(); // "modelo|chave" -> livre a partir de (ms)
// "modelo|chave" que deu 404: essa chave nao tem esse modelo. Fica fora do rodizio
// (nao entra na conta de "espera", senao a fila acharia que e cota e pararia).
const semModelo = new Set<string>();

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
// prazoTotalMs: teto da chamada inteira (todas as tentativas), para caber no limite da
// rota no servidor (estourar = a foto falha sem resposta nenhuma).
export async function gemini(corpo: unknown, forte = false, timeoutMs = 20000, prazoTotalMs?: number): Promise<RespostaGemini> {
  const fim = prazoTotalMs ? Date.now() + prazoTotalMs : Infinity;
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
      const sobra = fim - Date.now();
      if (sobra < 4000) break;
      if (semModelo.has(id)) continue;
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
          signal: AbortSignal.timeout(Math.min(timeoutMs, sobra)),
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
        if (r.status === 404) {
          // modelo que ESTA chave nao tem (as chaves 2 e 3 nao tem o 2.5-flash): fora so
          // nesta chave; as outras ainda tentam o mesmo modelo
          semModelo.add(id);
          continue;
        }
        if (r.status >= 500) break; // modelo fora do ar: tenta o proximo
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
