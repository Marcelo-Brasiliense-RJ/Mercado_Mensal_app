import { NextResponse } from "next/server";
import { createClient as clienteSessao } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { chatIdDaChave, chaveValida } from "@/lib/server/notaAtalho";

// O app pergunta, pela chave lida no QR, se a nota ja chegou pelo Atalho do iPhone.
// Achou: devolve os itens no mesmo formato da leitura da SEFAZ e apaga (uso unico).
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ chave: string }> }) {
  const { chave } = await ctx.params;
  const sessao = await clienteSessao();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });
  if (!chaveValida(chave)) return NextResponse.json({ ok: false, erro: "chave_invalida" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servico) return NextResponse.json({ ok: false, erro: "indisponivel" });

  const db = createClient(url, servico, { auth: { persistSession: false } });
  const id = chatIdDaChave(chave);
  const { data } = await db.from("receipt_drafts").select("photos, items").eq("chat_id", id).eq("status", "atalho").maybeSingle();
  if (!data) return NextResponse.json({ ok: false, erro: "ainda_nao" });
  await db.from("receipt_drafts").delete().eq("chat_id", id).eq("status", "atalho");

  const meta = (Array.isArray(data.photos) ? data.photos[0] : null) as { emitente?: string; total?: number } | null;
  const itens = (data.items ?? []) as { qtd: number; preco: number }[];
  const total_itens = Math.round(itens.reduce((t, i) => t + Number(i.qtd) * Number(i.preco), 0) * 100) / 100;
  const total_nota = Number(meta?.total ?? 0);
  return NextResponse.json({
    ok: true,
    chave,
    emitente: meta?.emitente ?? "",
    total_nota,
    total_itens,
    total_confere: !total_nota || Math.abs(total_itens - total_nota) <= Math.max(1, total_nota * 0.02),
    itens,
  });
}
