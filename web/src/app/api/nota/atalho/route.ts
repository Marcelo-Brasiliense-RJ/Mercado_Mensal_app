import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bloqueado, lerPaginaNfce, normalizar } from "@/lib/server/nfceRj";
import { chatIdDaChave, chaveValida } from "@/lib/server/notaAtalho";

// Recebe a pagina da nota que o Atalho do iPhone manda do Safari ("Enviar para Despensa").
// Sem login de proposito: o atalho e um so para todo mundo. A nota so vale se for a
// pagina de verdade da SEFAZ (itens + chave de 44 digitos) e fica guardada pela chave;
// so quem tem a nota na mao (leu o QR) pede ela de volta.
// A resposta e TEXTO: o atalho mostra direto na tela do iPhone.
export const runtime = "nodejs";
export const preferredRegion = "gru1";
export const maxDuration = 30;

const texto = (msg: string, status = 200) =>
  new NextResponse(msg, { status, headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" } });

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" },
  });
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servico) return texto("O app ainda não está pronto para receber notas. Avise quem cuida do app.", 503);

  let html = "";
  try {
    const bruto = await req.text();
    if (bruto.length > 3_000_000) return texto("Página grande demais.", 413);
    // O atalho pode mandar {"html": "..."} ou o HTML puro.
    try {
      html = String((JSON.parse(bruto) as { html?: unknown }).html ?? "");
    } catch {
      html = bruto;
    }
  } catch {
    /* corpo invalido */
  }
  if (!html) return texto("Não chegou nada. Abra a nota no Safari e use Compartilhar → Enviar para Despensa.", 400);
  if (bloqueado(html))
    return texto("A SEFAZ ainda está pedindo o código. Digite o código da imagem na página, espere a nota aparecer e envie de novo.", 422);

  const nota = lerPaginaNfce(html);
  if (!nota.itens.length || !chaveValida(nota.chave))
    return texto("Essa página não é uma nota fiscal. Abra a nota pelo QR do cupom e envie quando os produtos aparecerem.", 422);

  const nomes = await normalizar(nota.itens);
  const itens = nota.itens.map((it, i) => ({ ...nomes[i], qtd: it.qtd, preco: it.preco, unidade: it.unidade }));

  const db = createClient(url, servico, { auth: { persistSession: false } });
  // Limpa recebidas que ninguem buscou em 2 dias.
  await db.from("receipt_drafts").delete().eq("status", "atalho").lt("updated_at", new Date(Date.now() - 2 * 864e5).toISOString());
  const { error } = await db.from("receipt_drafts").upsert({
    chat_id: chatIdDaChave(nota.chave),
    household_id: null,
    status: "atalho",
    photos: [{ chave: nota.chave, emitente: nota.emitente, total: nota.total_nota }],
    items: itens,
    updated_at: new Date().toISOString(),
  });
  if (error) return texto("Não deu para guardar a nota agora. Tente de novo em instantes.", 502);

  const total = nota.total_nota.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return texto(`✅ Nota enviada: ${itens.length} itens, ${total}. Volte para o app Despensa.`);
}
