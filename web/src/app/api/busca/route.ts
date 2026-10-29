// Produtos como estao escritos no mercado ("Iogurte Integral Danone 1L"), com foto,
// para o autocompletar da lista. Mesmo catalogo publico VTEX das fotos (api/foto).
// Busca por nome, guardada um dia pela borda: a mesma busca serve a todas as casas.
export const runtime = "nodejs";

const LOJAS = ["www.savegnago.com.br", "www.mambo.com.br"];
const DIA = 60 * 60 * 24;

type Produto = { productName?: string; brand?: string; items?: { images?: { imageUrl?: string }[] }[] };
export type Achado = { nome: string; marca: string; foto: string | null };

async function buscar(loja: string, q: string): Promise<Achado[]> {
  const r = await fetch(
    `https://${loja}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=0&_to=11`,
    { headers: { "user-agent": "MercadoMensal/1.0 (app de dispensa domestica)" }, signal: AbortSignal.timeout(6000), next: { revalidate: DIA } },
  );
  if (!r.ok) throw new Error(String(r.status));
  const lista = (await r.json()) as Produto[];
  if (!lista.length) throw new Error("vazio");
  return lista
    .filter((p) => p.productName)
    .map((p) => ({
      nome: p.productName!.trim(),
      marca: p.brand ?? "",
      foto: p.items?.[0]?.images?.[0]?.imageUrl?.replace(/\/ids\/(\d+)\//, "/ids/$1-160-160/") ?? null,
    }));
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ itens: [] });
  try {
    // a primeira loja que responder com resultado
    const itens = await Promise.any(LOJAS.map((l) => buscar(l, q)));
    return Response.json({ itens: itens.slice(0, 8) }, { headers: { "cache-control": `public, max-age=${DIA}, s-maxage=${DIA}` } });
  } catch {
    return Response.json({ itens: [] }, { headers: { "cache-control": "public, max-age=3600" } });
  }
}
