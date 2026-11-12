import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lerCupom, totalConfere } from "@/lib/server/cupom";

// Foto do cupom -> itens. Duas leitoras:
// 1. Gemini direto (lib/server/cupom.ts): qualquer estado, varias fotos do mesmo cupom
//    (compra do mes nao cabe numa foto). E a principal.
// 2. Webhook do n8n (leitura antiga), so se o Gemini nao estiver configurado ou falhar
//    e vier uma foto so.
// Fica no servidor para as chaves nunca chegarem ao navegador e para exigir sessao.
// Recebe { image } ou { images: [] } (data URLs) e devolve
// { ok, itens, total, emitente, chave, confere }.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FOTOS = 6;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });
  }

  let fotos: string[] = [];
  try {
    const b = await req.json();
    const lista = Array.isArray(b?.images) ? b.images : [b?.image];
    fotos = lista.filter((x: unknown): x is string => typeof x === "string" && x.startsWith("data:image/")).slice(0, MAX_FOTOS);
  } catch {
    /* corpo invalido cai no check abaixo */
  }
  if (!fotos.length) {
    return NextResponse.json({ ok: false, erro: "sem_imagem" }, { status: 400 });
  }
  if (fotos.some((f) => f.length > 4_000_000)) {
    return NextResponse.json({ ok: false, erro: "imagem_grande" }, { status: 413 });
  }

  const c = await lerCupom(fotos);
  if (c.ok && c.itens.length) {
    return NextResponse.json({
      ok: true,
      itens: c.itens,
      total: c.total,
      emitente: c.emitente,
      chave: c.chave,
      qtd_itens: c.qtdItens,
      confere: totalConfere(c),
      por: "gemini",
    });
  }
  if (!c.ok && c.erro === "limite" && !process.env.N8N_RECEIPT_WEBHOOK_URL) {
    return NextResponse.json({ ok: false, erro: "limite", espera: c.espera }, { status: 429 });
  }

  // Reserva: a leitura antiga pelo n8n (uma foto).
  const url = process.env.N8N_RECEIPT_WEBHOOK_URL;
  const secret = process.env.N8N_RECEIPT_SECRET;
  if (!url || !secret) {
    const erro = !c.ok && c.erro === "ia_indisponivel" ? "ocr_indisponivel" : "ocr_falhou";
    return NextResponse.json({ ok: false, erro }, { status: erro === "ocr_indisponivel" ? 503 : 502 });
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-receipt-secret": secret },
      body: JSON.stringify({ image: fotos[0] }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) {
      return NextResponse.json({ ok: false, erro: "ocr_falhou" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      itens: Array.isArray(data.itens) ? data.itens : [],
      total: typeof data.total === "number" ? data.total : 0,
      emitente: "",
      chave: "",
      confere: true,
      por: "n8n",
    });
  } catch {
    return NextResponse.json({ ok: false, erro: "ocr_falhou" }, { status: 502 });
  }
}
