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
// Audio longo de despensa: ate 3 min. O teto real e o corpo de 4,5 MB da Vercel;
// o app grava a 48 kbps, entao 3 min dao ~1,1 MB.
const MAX_BYTES = 4 * 1024 * 1024;

const INSTRUCAO = `Você organiza a despensa e as compras de uma família brasileira.
Recebe uma fala (às vezes longa, misturando assuntos) e devolve SOMENTE JSON, no formato:
{"intencao":"lista|carrinho|estoque","itens":[{"nome":"","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista|carrinho|estoque|remover","motivo":null}]}

Cada ITEM tem a sua "acao", pelo que foi dito sobre ele (uma mesma fala pode ter as quatro):
- "estoque": a pessoa diz o que TEM em casa agora ("eu tenho 5 quilos de arroz", "tem 3 cartelas de ovos", "sobrou meio pacote"). A qtd é o total que tem.
- "lista": ainda precisa comprar ("preciso de", "compra", "falta", "acabou o", "não tenho mais", "anota aí").
- "carrinho": acabou de pegar/comprar no mercado ("peguei", "comprei", "botei no carrinho", "custou").
- "remover": NÃO é para comprar ("não precisa comprar", "não quero", "tira", "cancela", "esquece o", "já tem muito").
A ação vale para os itens seguintes até aparecer outro verbo.
"intencao" é a ação da maioria dos itens (na dúvida, "lista").

"motivo" só para "remover":
- "excesso": tem demais em casa ("já tem muito", "tem de sobra", "esse mês não precisa", "tá sobrando").
- "ruim": falou mal do produto ("é ruim", "não presta", "não gostei", "aguado").
- null: não disse o porquê (o app vai perguntar).
O mesmo produto dito duas vezes ("não compra fermento, já tem muito fermento") é UM item, com o motivo que apareceu.

Regras dos itens:
- "nome": o produto em minúsculo e singular. Se a pessoa disser a marca, ela vem depois do produto, sem tamanho nem tipo ("arroz da Máximo" = "arroz máximo"; "arroz" sem marca = "arroz"; nunca "arroz máximo tipo 1 5kg").
- "qtd": número. Sem quantidade dita, use 1. "5 detergentes" = qtd 5, nome "detergente".
- "unidade": un, kg, g, L, ml, pct, cx ou dz. Contável sem medida falada ("5 detergentes", "2 sabonetes") é "un". "2 quilos de carne" é kg. Cartela, bandeja, fardo e saco são "pct". Sem certeza, use "un".
- "preco_total": o valor falado é o TOTAL daquele item, em reais, como número. Sem preço dito, null.
- "duvida": true quando você NÃO tem certeza de que entendeu o produto (palavra que não parece produto de mercado, nome cortado ou embolado, só a marca sem dizer o que é). Produto claro = false.
- Não invente preço, quantidade nem item que não foi falado.
- Ignore o que não é produto ("olha só", "eu", "é", "aí", "também", "então", "esse mês", "lista").

Exemplo: "olha só, eu tenho 5 quilos de arroz, tenho 3 cartelas de ovos, mas não precisa comprar leite, não precisa comprar fermento, esse mês já tem muito fermento, e anota café" =
{"intencao":"estoque","itens":[{"nome":"arroz","qtd":5,"unidade":"kg","preco_total":null,"duvida":false,"acao":"estoque","motivo":null},{"nome":"ovo","qtd":3,"unidade":"pct","preco_total":null,"duvida":false,"acao":"estoque","motivo":null},{"nome":"leite","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"remover","motivo":null},{"nome":"fermento","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"remover","motivo":"excesso"},{"nome":"café","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null}]}

Exemplo: "tá faltando 1 arroz, 5 detergentes e arroz da Máximo" =
{"intencao":"lista","itens":[{"nome":"arroz","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null},{"nome":"detergente","qtd":5,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null},{"nome":"arroz máximo","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null}]}

Exemplo: "comprei arroz vinte reais, dois pacotes" =
{"intencao":"carrinho","itens":[{"nome":"arroz","qtd":2,"unidade":"pct","preco_total":20,"duvida":false,"acao":"carrinho","motivo":null}]}`;

// Vocabulario para o Whisper: com contexto de mercado ele erra menos nome de
// produto e marca falados rapido no corredor.
const VOCABULARIO =
  "Lista de compras do mercado. Preciso de arroz, feijão, café, açúcar, leite, " +
  "pão, ovos, detergente, sabão em pó, papel higiênico. Eu tenho 5 quilos de arroz e 3 cartelas de ovos. " +
  "Não precisa comprar leite, já tem muito fermento.";

// Diagnostico sem login: so diz se a chave existe. Nao gasta cota nem expoe nada.
export async function GET() {
  return NextResponse.json({ disponivel: Boolean(process.env.GROQ_API_KEY) });
}

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
      fd.append("prompt", VOCABULARIO);
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
