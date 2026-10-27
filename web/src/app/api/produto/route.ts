import { NextResponse } from "next/server";
import { mapearOpenFoodFacts, mapearVtex, type ProdutoPublico } from "@/lib/produtoPublico";

// Nome (e foto) do produto pelo codigo de barras, em bases publicas.
//
// Vai pelo servidor por dois motivos: as bases pedem User-Agent identificado, e
// assim a resposta pode ser cacheada pela borda, entao o mesmo codigo lido por
// qualquer pessoa da casa nao custa uma ida nova.
//
// Fontes, todas ao mesmo tempo, fica a primeira que achar:
// - Open Food Facts: comida e bebida.
// - catalogo publico de lojas VTEX (supermercados e farmacias brasileiros), que busca
//   pelo EAN e cobre limpeza, higiene, bebe e o resto do mercado. Testado com creme
//   dental, absorvente e detergente que o Open Food Facts nao tinha.
// Uma consulta por codigo novo (o app guarda o vinculo depois), uso baixo e pessoal.
//
// Nao exige sessao de proposito: o modo sem conta (/mercado) tambem usa.
export const runtime = "nodejs";

const UA = "MercadoMensal/1.0 (app de dispensa domestica)";
const SEMANA = 60 * 60 * 24 * 7;
const OFF = "https://world.openfoodfacts.org/api/v2/product";
const CAMPOS = "product_name,product_name_pt,brands,quantity";
// Ordem nao importa (vence a mais rapida que achar); varias porque cada loja tem
// um sortimento: supermercado do RJ e de SP, mercado de bairro e duas farmacias.
const LOJAS_VTEX = [
  "www.zonasul.com.br",
  "www.savegnago.com.br",
  "www.mambo.com.br",
  "www.drogariasaopaulo.com.br",
  "www.paguemenos.com.br",
];

async function buscar(url: string, mapear: (j: unknown) => ProdutoPublico | null): Promise<ProdutoPublico> {
  const r = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(6000),
    // A base muda pouco e o custo de errar e baixo (a pessoa confere na tela).
    next: { revalidate: SEMANA },
  });
  if (!r.ok) throw new Error(String(r.status));
  const achado = mapear(await r.json());
  if (!achado) throw new Error("nao achou");
  return achado;
}

export async function GET(req: Request) {
  const codigo = (new URL(req.url).searchParams.get("codigo") ?? "").replace(/\D/g, "");
  if (codigo.length < 6) {
    return NextResponse.json({ ok: false, erro: "codigo_invalido" }, { status: 400 });
  }

  const fontes = [
    buscar(`${OFF}/${codigo}.json?fields=${CAMPOS}`, mapearOpenFoodFacts),
    ...LOJAS_VTEX.map((h) =>
      buscar(`https://${h}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${codigo}`, mapearVtex),
    ),
  ];
  try {
    const achado = await Promise.any(fontes);
    return NextResponse.json({ ok: true, encontrado: true, ...achado });
  } catch {
    // Nao e erro: produto muito novo ou regional. A tela pede o nome uma vez e o
    // app guarda o vinculo do codigo para a proxima leitura.
    return NextResponse.json({ ok: true, encontrado: false });
  }
}
