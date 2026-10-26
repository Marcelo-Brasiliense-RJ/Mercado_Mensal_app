import { NextResponse } from "next/server";
import { mapearOpenFoodFacts } from "@/lib/produtoPublico";

// Nome do produto pelo codigo de barras, na base publica Open Food Facts.
//
// Vai pelo servidor por dois motivos: a base pede User-Agent identificado, e
// assim a resposta pode ser cacheada pela borda, entao o mesmo codigo lido por
// qualquer pessoa da casa nao custa uma ida nova.
//
// Nao exige sessao de proposito: o modo sem conta (/mercado) tambem usa.
export const runtime = "nodejs";

const OFF = "https://world.openfoodfacts.org/api/v2/product";
const CAMPOS = "product_name,product_name_pt,brands,quantity";

export async function GET(req: Request) {
  const codigo = (new URL(req.url).searchParams.get("codigo") ?? "").replace(/\D/g, "");
  if (codigo.length < 6) {
    return NextResponse.json({ ok: false, erro: "codigo_invalido" }, { status: 400 });
  }

  try {
    const r = await fetch(`${OFF}/${codigo}.json?fields=${CAMPOS}`, {
      headers: { "user-agent": "MercadoMensal/1.0 (app de dispensa domestica)" },
      // A base muda pouco e o custo de errar e baixo (a pessoa confere na tela).
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, erro: "base_indisponivel" }, { status: 502 });
    }
    const achado = mapearOpenFoodFacts(await r.json());
    if (!achado) {
      // Nao e erro: a base nao cobre limpeza e higiene, e produto novo demora a
      // entrar. A tela simplesmente pede o nome, como fazia antes.
      return NextResponse.json({ ok: true, encontrado: false });
    }
    return NextResponse.json({ ok: true, encontrado: true, ...achado });
  } catch {
    return NextResponse.json({ ok: false, erro: "base_indisponivel" }, { status: 502 });
  }
}
