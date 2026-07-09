import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy servidor -> webhook do n8n (que faz a leitura da nota com visao).
// Fica no servidor para o segredo do webhook nunca chegar ao navegador e para
// exigir sessao (evita abuso da nossa cota de visao). Recebe { image } (data URL
// base64) e devolve { ok, itens, total }.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });
  }

  const url = process.env.N8N_RECEIPT_WEBHOOK_URL;
  const secret = process.env.N8N_RECEIPT_SECRET;
  if (!url || !secret) {
    return NextResponse.json({ ok: false, erro: "ocr_indisponivel" }, { status: 503 });
  }

  let image: unknown;
  try {
    image = (await req.json())?.image;
  } catch {
    /* corpo invalido cai no check abaixo */
  }
  if (typeof image !== "string" || !image) {
    return NextResponse.json({ ok: false, erro: "sem_imagem" }, { status: 400 });
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-receipt-secret": secret },
      body: JSON.stringify({ image }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) {
      return NextResponse.json({ ok: false, erro: "ocr_falhou" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      itens: Array.isArray(data.itens) ? data.itens : [],
      total: typeof data.total === "number" ? data.total : 0,
    });
  } catch {
    return NextResponse.json({ ok: false, erro: "ocr_falhou" }, { status: 502 });
  }
}
