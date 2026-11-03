import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { entenderTexto, type Tela } from "@/lib/server/entender";
import { chavesGemini } from "@/lib/server/gemini";

// Ditado do app: audio -> texto (Groq Whisper) -> itens (lib/server/entender) -> a tela
// confirma antes de gravar. Roda no servidor pelos mesmos dois motivos da rota de
// OCR: a chave nunca chega ao navegador e a sessao e exigida (a cota e nossa).
//
// Nao grava nada no banco de proposito. Quem escreve e a tela, pelas RPCs _web
// que ja existem, DEPOIS de a pessoa conferir. A falha numero 1 do bot em uso
// real foi classificacao errada de intencao (secao 2 do tarefas.md), e ali nao
// havia tela nenhuma entre o modelo e o banco.
export const runtime = "nodejs";

const GROQ = "https://api.groq.com/openai/v1";
// Em ordem: se a Groq desligar um modelo, o proximo assume.
const MODELOS_TRANSCRICAO = ["whisper-large-v3", "whisper-large-v3-turbo"];
// Audio longo de despensa: ate 3 min. O teto real e o corpo de 4,5 MB da Vercel;
// o app grava a 48 kbps, entao 3 min dao ~1,1 MB.
const MAX_BYTES = 4 * 1024 * 1024;

// Vocabulario para o Whisper: com contexto de mercado ele erra menos nome de
// produto e marca falados rapido no corredor.
const VOCABULARIO =
  "Lista de compras do mercado. Preciso de arroz, feijão, café, açúcar, leite, " +
  "pão, ovos, detergente, sabão em pó, papel higiênico. Eu tenho 5 quilos de arroz e 3 cartelas de ovos. " +
  "Não precisa comprar leite, já tem muito fermento.";

// Diagnostico sem login: so diz se a chave existe. Nao gasta cota nem expoe nada.
export async function GET() {
  // disponivel: transcricao no servidor (Groq). entender: IA para texto/foto (Groq ou Gemini).
  return NextResponse.json({
    disponivel: Boolean(process.env.GROQ_API_KEY),
    entender: Boolean(process.env.GROQ_API_KEY) || chavesGemini().length > 0,
  });
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
  let form: FormData | null = null;
  try {
    form = await req.formData();
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
    // Mesmo cerebro do texto digitado e da foto (lib/server/entender.ts).
    const tela = String(form?.get("tela") ?? "") as Tela;
    const e = await entenderTexto(texto, tela || undefined);
    return NextResponse.json({ ok: true, texto, intencao: e.intencao, itens: e.itens });
  } catch {
    return NextResponse.json({ ok: false, erro: "transcricao_falhou" }, { status: 502 });
  }
}
