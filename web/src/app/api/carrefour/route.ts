// Preco do Carrefour Mercado (loja online, pontua na Livelo) para um item da lista,
// buscado na hora no catalogo publico VTEX do site. Antes era preciso entrar no site,
// procurar item por item e fazer a conta na mao. Guardado 6 horas pela borda: a mesma
// busca serve a todas as casas.
// ponytail: preco da regiao padrao do site (sem CEP), igual ao coletor semanal.
import { produtoCasa, type ProdutoCarrefour } from "@/lib/comparar";

export const runtime = "nodejs";

const BASE = "https://mercado.carrefour.com.br";
const SEIS_HORAS = 60 * 60 * 6;

type Vtex = {
  productName?: string;
  brand?: string;
  linkText?: string;
  items?: {
    images?: { imageUrl?: string }[];
    sellers?: { commertialOffer?: { Price?: number; ListPrice?: number; AvailableQuantity?: number } }[];
  }[];
};

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ ok: true, itens: [] });
  try {
    const r = await fetch(
      `${BASE}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=0&_to=19`,
      {
        headers: { "user-agent": "MercadoMensal/1.0 (app de dispensa domestica)" },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: SEIS_HORAS },
      },
    );
    if (!r.ok) throw new Error(String(r.status));
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
        url: p.linkText ? `${BASE}/${p.linkText}/p` : null,
        foto: item?.images?.[0]?.imageUrl?.replace(/\/ids\/(\d+)\//, "/ids/$1-160-160/") ?? null,
      });
    }
    itens.sort((a, b) => a.preco - b.preco);
    return Response.json(
      { ok: true, itens: itens.slice(0, 3) },
      { headers: { "cache-control": `public, max-age=3600, s-maxage=${SEIS_HORAS}` } },
    );
  } catch (e) {
    console.error("carrefour: busca falhou", q, String(e));
    return Response.json({ ok: false, itens: [] }, { headers: { "cache-control": "public, max-age=600" } });
  }
}
