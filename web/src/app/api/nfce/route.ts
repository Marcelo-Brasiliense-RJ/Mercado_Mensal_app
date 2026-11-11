import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buscarPagina, lerPaginaNfce, normalizar, urlDeNota } from "@/lib/server/nfceRj";
import { chaveDoQr } from "@/lib/nfce";

// QR da NFC-e -> itens da nota (lib/server/nfceRj). Exige sessao. A pagina vem do
// intermediario com IP brasileiro, se configurado (NFCE_RELAY_URL), ou direto.
// Devolve o mesmo formato da antiga Edge Function nfce-consulta.
export const runtime = "nodejs";
export const preferredRegion = "gru1"; // Sao Paulo: perto da SEFAZ
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  let url = "";
  try {
    url = String((await req.json())?.qr_url ?? "").trim();
  } catch {
    /* cai no check abaixo */
  }
  if (!urlDeNota(url)) return NextResponse.json({ ok: false, erro: "qr_invalido" }, { status: 400 });

  const pag = await buscarPagina(url);
  if (!pag.ok) return NextResponse.json({ ok: false, erro: pag.erro }, { status: 502 });
  const nota = lerPaginaNfce(pag.html);
  if (!nota.itens.length) return NextResponse.json({ ok: false, erro: "parse_falhou" }, { status: 502 });

  const nomes = await normalizar(nota.itens);
  const itens = nota.itens.map((it, i) => ({ ...nomes[i], qtd: it.qtd, preco: it.preco, unidade: it.unidade, desc_fiscal: it.desc_fiscal }));
  const total_itens = Math.round(itens.reduce((t, i) => t + i.qtd * i.preco, 0) * 100) / 100;
  const tol = Math.max(1, nota.total_nota * 0.02);
  return NextResponse.json({
    ok: true,
    chave: nota.chave || chaveDoQr(url),
    emitente: nota.emitente,
    data: null,
    total_nota: nota.total_nota,
    total_itens,
    total_confere: nota.total_nota === 0 || Math.abs(total_itens - nota.total_nota) <= tol,
    itens,
  });
}
