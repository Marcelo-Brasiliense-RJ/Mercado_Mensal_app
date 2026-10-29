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
  "Foto de um produto de supermercado. Diga qual é. nome: como está no rótulo, em português, " +
  "com tipo, marca, variante e tamanho (ex.: 'Detergente Líquido Ypê Neutro 500ml'). " +
  "codigo: os números do código de barras se estiverem legíveis na foto, senão vazio. " +
  "Se não for produto de mercado ou não der para ler, nome vazio.";
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
  try {
    const b = await req.json();
    image = b?.image;
    if (typeof b?.nao === "string") nao = b.nao.slice(0, 120).trim();
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
  for (const modelo of nao ? [...MODELOS].reverse() : MODELOS) {
    for (const k of ks) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": k },
          body: corpo,
          signal: AbortSignal.timeout(20000),
        });
        if (r.status === 429 || r.status === 403) continue; // cota desta chave: tenta a proxima
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
  return NextResponse.json({ ok: false, erro: "ia_falhou" }, { status: 502 });
}
