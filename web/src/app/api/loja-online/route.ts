// Preco de um item da lista numa loja online que pontua na Livelo (src/lib/lojasOnline.ts),
// buscado na hora no catalogo publico VTEX do site. Guardado 6 horas pela borda: a
// mesma busca serve a todas as casas.
// ponytail: preco da regiao padrao do site (sem CEP).
import { produtoCasa, type ProdutoCarrefour } from "@/lib/comparar";
import { lojaDe } from "@/lib/lojasOnline";

export const runtime = "nodejs";

const SEIS_HORAS = 60 * 60 * 6;

type Vtex = {
  productName?: string;
  linkText?: string;
  items?: {
    images?: { imageUrl?: string }[];
    sellers?: { commertialOffer?: { Price?: number; ListPrice?: number; AvailableQuantity?: number } }[];
  }[];
};

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const loja = lojaDe(u.get("loja") ?? "");
  const q = (u.get("q") ?? "").trim().slice(0, 60);
  if (!loja) return Response.json({ ok: false, itens: [] }, { status: 400 });
  if (q.length < 2) return Response.json({ ok: true, itens: [] });
  try {
    const r = await fetch(
      `${loja.site}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=0&_to=19`,
      {
        headers: { "user-agent": "MercadoMensal/1.0 (app de dispensa domestica)" },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: SEIS_HORAS },
      },
    );
    if (!r.ok && r.status !== 206) throw new Error(String(r.status));
    const lista = (await r.json()) as Vtex[];
    const itens: ProdutoCarrefour[] = [];
    for (const p of lista) {
      const nome = (p.productName ?? "").trim();
      const item = p.items?.[0];
      const oferta = item?.sellers?.[0]?.commertialOffer;
      if (!nome || !oferta?.Price || oferta.Price <= 0 || !oferta.AvailableQuantity) continue;
      if (!produtoCasa(nome, q)) continue;
      itens.push({
        nome,
        preco: oferta.Price,
        de: oferta.ListPrice && oferta.ListPrice > oferta.Price ? oferta.ListPrice : null,
        url: p.linkText ? `${loja.site}/${p.linkText}/p` : null,
        foto: item?.images?.[0]?.imageUrl ?? null,
      });
    }
    itens.sort((a, b) => a.preco - b.preco);
    return Response.json(
      { ok: true, itens: itens.slice(0, 3) },
      { headers: { "cache-control": `public, max-age=3600, s-maxage=${SEIS_HORAS}` } },
    );
  } catch (e) {
    console.error("lojas: busca falhou", loja.codigo, q, String(e));
    return Response.json({ ok: false, itens: [] }, { headers: { "cache-control": "public, max-age=600" } });
  }
}
