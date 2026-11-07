import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { entenderFoto, entenderTexto, type Tela } from "@/lib/server/entender";

// Texto digitado ou foto (despensa, lista escrita, carrinho) -> itens, com o MESMO
// entendimento do audio (lib/server/entender.ts). Tambem recebe a frase que o
// proprio celular transcreveu quando a Groq nao esta configurada: assim ate o
// "plano B" da voz e entendido por IA, nao so por regra.
export const runtime = "nodejs";

const TELAS: Tela[] = ["estoque", "lista", "mercado", "auto", "atualizar"];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  let b: { texto?: unknown; foto?: unknown; tela?: unknown } = {};
  try {
    b = await req.json();
  } catch {
    /* corpo invalido cai nos checks abaixo */
  }
  const tela = TELAS.includes(b.tela as Tela) ? (b.tela as Tela) : undefined;

  if (typeof b.foto === "string") {
    if (b.foto.length > 4_000_000) return NextResponse.json({ ok: false, erro: "imagem_grande" }, { status: 413 });
    const r = await entenderFoto(b.foto, tela);
    if (r.ok) return NextResponse.json(r);
    if (r.erro === "limite") return NextResponse.json({ ok: false, erro: "limite", espera: r.espera }, { status: 429 });
    return NextResponse.json({ ok: false, erro: r.erro }, { status: r.erro === "ia_indisponivel" ? 503 : 502 });
  }

  const texto = typeof b.texto === "string" ? b.texto.trim().slice(0, 4000) : "";
  if (!texto) return NextResponse.json({ ok: false, erro: "sem_texto" }, { status: 400 });
  const e = await entenderTexto(texto, tela);
  return NextResponse.json({ ok: true, texto, intencao: e.intencao, itens: e.itens, por: e.por });
}
