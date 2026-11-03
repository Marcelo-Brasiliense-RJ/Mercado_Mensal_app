import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { intencaoValida, interpretarLocal, normalizaItens } from "@/lib/voz";

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
// Em ordem: se a Groq desligar um modelo, o proximo assume. O llama-3.3-70b foi
// desligado em ago/2026 e a voz passou a "ouvir mas nao por nada na lista".
const MODELOS_TRANSCRICAO = ["whisper-large-v3", "whisper-large-v3-turbo"];
const MODELOS_TEXTO = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"];
const MAX_BYTES = 8 * 1024 * 1024; // ~1 min de opus sobra; corta antes de gastar cota

const INSTRUCAO = `Você organiza compras de supermercado de uma família brasileira.
Recebe uma frase falada e devolve SOMENTE JSON, no formato:
{"intencao":"lista|carrinho|estoque","itens":[{"nome":"","qtd":1,"unidade":"un","preco_total":null,"duvida":false}]}

Como classificar a intenção, pelo verbo:
- "carrinho": acabou de pegar/comprar agora ("peguei", "comprei", "botei no carrinho", "custou").
- "lista": ainda vai comprar ("preciso de", "vou comprar", "falta", "acabou o", "anota aí").
- "estoque": está conferindo o que tem em casa ("tenho", "sobrou", "ainda tem", "conferindo").
Na dúvida entre lista e carrinho, use "lista".

Regras dos itens:
- "nome": o produto em minúsculo e singular. Se a pessoa disser a marca, ela vem depois do produto, sem tamanho nem tipo ("arroz da Máximo" = "arroz máximo"; "arroz" sem marca = "arroz"; nunca "arroz máximo tipo 1 5kg").
- "qtd": número. Sem quantidade dita, use 1. "5 detergentes" = qtd 5, nome "detergente".
- "unidade": un, kg, g, L, ml, pct, cx ou dz. Contável sem medida falada ("5 detergentes", "2 sabonetes") é "un". "2 quilos de carne" é kg. Sem certeza, use "un".
- "preco_total": o valor falado é o TOTAL daquele item, em reais, como número. Sem preço dito, null.
- "duvida": true quando você NÃO tem certeza de que entendeu o produto (palavra que não parece produto de mercado, nome cortado ou embolado, só a marca sem dizer o que é). Produto claro = false.
- Não invente preço, quantidade nem item que não foi falado.
- Vários produtos na mesma frase viram vários itens.

Exemplo: "tá faltando 1 arroz, 1 feijão, 5 detergentes e arroz da Máximo" =
{"intencao":"lista","itens":[{"nome":"arroz","qtd":1,"unidade":"un","preco_total":null,"duvida":false},{"nome":"feijão","qtd":1,"unidade":"un","preco_total":null,"duvida":false},{"nome":"detergente","qtd":5,"unidade":"un","preco_total":null,"duvida":false},{"nome":"arroz máximo","qtd":1,"unidade":"un","preco_total":null,"duvida":false}]}`;

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
    let texto = "";
    let transcreveu = false;
    for (const modelo of MODELOS_TRANSCRICAO) {
      const fd = new FormData();
      fd.append("file", audio, audio.name || "audio.webm");
      fd.append("model", modelo);
      fd.append("language", "pt");
      fd.append("temperature", "0");
      const tr = await fetch(`${GROQ}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: fd,
      });
      if (!tr.ok) {
        // Aparece no log da Vercel: chave errada (401), modelo desligado ou formato recusado (400).
        console.error("voz: groq transcricao", modelo, tr.status, await tr.text().catch(() => ""));
        if (tr.status === 401) break;
        continue;
      }
      transcreveu = true;
      texto = String(((await tr.json()) as { text?: string })?.text ?? "").trim();
      break;
    }
    if (!transcreveu) {
      return NextResponse.json({ ok: false, erro: "transcricao_falhou" }, { status: 502 });
    }
    if (!texto) {
      console.error("voz: transcricao vazia", audio.type, audio.size);
      return NextResponse.json({ ok: false, erro: "nao_entendi" }, { status: 422 });
    }

    // ============ 2. SEPARAR EM ITENS ============
    let json: { intencao?: unknown; itens?: unknown } | null = null;
    for (const modelo of MODELOS_TEXTO) {
      const ct = await fetch(`${GROQ}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelo,
          temperature: 0,
          response_format: { type: "json_object" },
          ...(modelo.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
          messages: [
            { role: "system", content: INSTRUCAO },
            { role: "user", content: texto },
          ],
        }),
      });
      if (!ct.ok) {
        console.error("voz: groq texto", modelo, ct.status, await ct.text().catch(() => ""));
        continue;
      }
      const bruto = (await ct.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      try {
        json = JSON.parse(bruto.choices?.[0]?.message?.content ?? "");
        break;
      } catch {
        /* modelo fugiu do formato: tenta o proximo */
      }
    }

    // Nenhum modelo respondeu: a frase ja foi ouvida, entao separa por regra aqui
    // mesmo em vez de devolver lista vazia (que era o "nao pos nada na lista").
    const itens = normalizaItens(json?.itens);
    if (!json || !itens.length) {
      const local = interpretarLocal(texto);
      if (local.itens.length) {
        return NextResponse.json({ ok: true, texto, ...local, local: true });
      }
    }

    return NextResponse.json({
      ok: true,
      texto,
      intencao: intencaoValida(json?.intencao),
      itens,
    });
  } catch {
    return NextResponse.json({ ok: false, erro: "transcricao_falhou" }, { status: 502 });
  }
}
