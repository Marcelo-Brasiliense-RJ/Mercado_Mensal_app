import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { intencaoValida, normalizaItens } from "@/lib/voz";

// Ditado do app: audio -> texto (Groq Whisper) -> itens (Groq LLM) -> a tela
// confirma antes de gravar. Roda no servidor pelos mesmos dois motivos da rota de
// OCR: a chave nunca chega ao navegador e a sessao e exigida (a cota e nossa).
//
// Nao grava nada no banco de proposito. Quem escreve e a tela, pelas RPCs _web
// que ja existem, DEPOIS de a pessoa conferir. A falha numero 1 do bot em uso
// real foi classificacao errada de intencao (secao 2 do tarefas.md), e ali nao
// havia tela nenhuma entre o modelo e o banco.
export const runtime = "nodejs";

const GROQ = "https://api.groq.com/openai/v1";
const MODELO_TRANSCRICAO = "whisper-large-v3";
const MODELO_TEXTO = "llama-3.3-70b-versatile";
const MAX_BYTES = 8 * 1024 * 1024; // ~1 min de opus sobra; corta antes de gastar cota

const INSTRUCAO = `Você organiza compras de supermercado de uma família brasileira.
Recebe uma frase falada e devolve SOMENTE JSON, no formato:
{"intencao":"lista|carrinho|estoque","itens":[{"nome":"","qtd":1,"unidade":"un","preco_total":null}]}

Como classificar a intenção, pelo verbo:
- "carrinho": acabou de pegar/comprar agora ("peguei", "comprei", "botei no carrinho", "custou").
- "lista": ainda vai comprar ("preciso de", "vou comprar", "falta", "acabou o", "anota aí").
- "estoque": está conferindo o que tem em casa ("tenho", "sobrou", "ainda tem", "conferindo").
Na dúvida entre lista e carrinho, use "lista".

Regras dos itens:
- "nome": nome genérico do produto em minúsculo e singular, sem marca ("arroz", não "arroz tio joão 5kg").
- "qtd": número. Sem quantidade dita, use 1.
- "unidade": un, kg, g, L, ml, pct, cx ou dz. Sem certeza, use "un".
- "preco_total": o valor falado é o TOTAL daquele item, em reais, como número. Sem preço dito, null.
- Não invente preço, quantidade nem item que não foi falado.
- Vários produtos na mesma frase viram vários itens.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    // Ambiente sem chave nao quebra a tela: ela explica e oferece o caminho digitado.
    return NextResponse.json({ ok: false, erro: "voz_indisponivel" }, { status: 503 });
  }

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    if (f instanceof File) audio = f;
  } catch {
    /* corpo invalido cai no check abaixo */
  }
  if (!audio || audio.size === 0) {
    return NextResponse.json({ ok: false, erro: "sem_audio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, erro: "audio_grande" }, { status: 413 });
  }

  try {
    // ============ 1. TRANSCREVER ============
    const fd = new FormData();
    fd.append("file", audio, audio.name || "audio.webm");
    fd.append("model", MODELO_TRANSCRICAO);
    fd.append("language", "pt");
    fd.append("temperature", "0");
    const tr = await fetch(`${GROQ}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: fd,
    });
    if (!tr.ok) {
      return NextResponse.json(
        { ok: false, erro: "transcricao_falhou" },
        { status: 502 },
      );
    }
    const texto = String(((await tr.json()) as { text?: string })?.text ?? "").trim();
    if (!texto) {
      return NextResponse.json({ ok: false, erro: "nao_entendi" }, { status: 422 });
    }

    // ============ 2. SEPARAR EM ITENS ============
    const ct = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO_TEXTO,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCAO },
          { role: "user", content: texto },
        ],
      }),
    });
    if (!ct.ok) {
      // Transcreveu mas nao interpretou: devolve o texto assim mesmo, porque ver o
      // que foi ouvido ja vale (a pessoa digita o resto) e evita perder a gravacao.
      return NextResponse.json({ ok: true, texto, intencao: "lista", itens: [] });
    }
    const bruto = (await ct.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    let json: { intencao?: unknown; itens?: unknown } = {};
    try {
      json = JSON.parse(bruto.choices?.[0]?.message?.content ?? "{}");
    } catch {
      /* modelo fugiu do formato: cai no fallback abaixo */
    }

    return NextResponse.json({
      ok: true,
      texto,
      intencao: intencaoValida(json.intencao),
      itens: normalizaItens(json.itens),
    });
  } catch {
    return NextResponse.json({ ok: false, erro: "transcricao_falhou" }, { status: 502 });
  }
}
