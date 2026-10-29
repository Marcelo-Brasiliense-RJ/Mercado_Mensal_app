import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Não consegui ler o código": a foto do produto vai para o Gemini, que devolve o nome
// como no rotulo (e o codigo de barras, se aparecer na foto). Fica no servidor para a
// chave nunca chegar ao navegador e para exigir sessao (a cota gratuita e pequena).
//
// Rapido primeiro: modelos "lite" na frente, e varias chaves (GEMINI_API_KEY, _2, _3...)
// se uma estourar a cota do dia, igual ao monitor de promocoes.
export const runtime = "nodejs";

const MODELOS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-3.5-flash"];
const PERGUNTA =
  "Foto de um produto de supermercado, muitas vezes na mão, torta ou de lado. Leia o nome " +
  "escrito na FRENTE da embalagem e diga qual é. nome: como está no rótulo, em português, " +
  "com tipo, marca, variante e tamanho (ex.: 'Detergente Líquido Ypê Neutro 500ml'). " +
  "codigo: os números do código de barras se estiverem legíveis na foto, senão vazio. " +
  "Se der para ler só parte, dê o melhor palpite. Nome vazio só se não for produto de mercado.";
const ESQUEMA = {
  type: "OBJECT",
  properties: {
    nome: { type: "STRING" },
    marca: { type: "STRING" },
    tamanho: { type: "STRING" },
    codigo: { type: "STRING" },
  },
  required: ["nome", "marca", "tamanho", "codigo"],
};

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

function chaves(): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(process.env)) if (/^GEMINI_API_KEY(_\d+)?$/.test(k) && v) out.push(v);
  return out.sort();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  let image: unknown;
  // "Pedir pra rever": a pessoa disse que nao e o nome que veio. Vai com o modelo mais
  // forte na frente e avisando o que ja foi descartado.
  let nao = "";
  let forte = false; // a rapida nao soube: modelo mais forte na frente
  try {
    const b = await req.json();
    image = b?.image;
    if (typeof b?.nao === "string") nao = b.nao.slice(0, 120).trim();
    forte = b?.forte === true;
  } catch {
    /* corpo invalido cai no check abaixo */
  }
  const m = typeof image === "string" ? image.match(/^data:(image\/[a-z]+);base64,(.+)$/) : null;
  if (!m) return NextResponse.json({ ok: false, erro: "sem_imagem" }, { status: 400 });
  if (m[2].length > 4_000_000) return NextResponse.json({ ok: false, erro: "imagem_grande" }, { status: 413 });

  const ks = chaves();
  if (!ks.length) return NextResponse.json({ ok: false, erro: "ia_indisponivel" }, { status: 503 });

  const corpo = JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { mime_type: m[1], data: m[2] } },
          { text: nao ? `${PERGUNTA} Atenção: NÃO é "${nao}"; olhe o rótulo de novo com cuidado.` : PERGUNTA },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA, temperature: 0 },
  });
  // Rodizio: cada pedido comeca numa chave diferente (a cota se espalha) e a chave que
  // levou 429 descansa o tempo que o Google pediu, por modelo. Com tudo descansando,
  // devolve 429 com a espera: a fila do celular aguarda e tenta de novo, sem perder a foto.
  const inicio = vez++ % ks.length;
  let espera = Infinity;
  for (const modelo of nao || forte ? [...MODELOS].reverse() : MODELOS) {
    for (let n = 0; n < ks.length; n++) {
      const i = (inicio + n) % ks.length;
      const id = `${modelo}|${i}`;
      const livre = descanso.get(id) ?? 0;
      if (livre > Date.now()) {
        espera = Math.min(espera, livre - Date.now());
        continue;
      }
      const k = ks[i];
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": k },
          body: corpo,
          signal: AbortSignal.timeout(20000),
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
        if (!txt) continue;
        const d = JSON.parse(txt) as { nome?: string; marca?: string; tamanho?: string; codigo?: string };
        const codigo = (d.codigo ?? "").replace(/\D/g, "");
        return NextResponse.json({
          ok: true,
          encontrado: !!d.nome?.trim(),
          nome: (d.nome ?? "").trim(),
          marca: (d.marca ?? "").trim(),
          tamanho: (d.tamanho ?? "").trim(),
          codigo: codigo.length >= 8 ? codigo : "",
        });
      } catch {
        // rede ou resposta quebrada: tenta a proxima chave
      }
    }
  }
  if (espera < Infinity)
    return NextResponse.json({ ok: false, erro: "limite", espera: Math.max(5, Math.ceil(espera / 1000)) }, { status: 429 });
  return NextResponse.json({ ok: false, erro: "ia_falhou" }, { status: 502 });
}
