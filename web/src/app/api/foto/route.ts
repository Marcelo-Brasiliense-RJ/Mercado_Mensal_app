// Foto de um item da casa pelo NOME ("arroz", "pao de forma"), para o estoque e a lista
// terem cara de produto. Busca no catalogo publico de lojas VTEX (mesma fonte do codigo
// de barras) e redireciona para a imagem, ja em tamanho de miniatura.
//
// So aceita produto com as palavras do item (lib/fotoPorNome): sem um bom, 404 e o app
// mostra o icone da categoria. Antes pegava o primeiro resultado e errava a foto.
// Uma busca por nome, guardada uma semana pela borda e pelo navegador: a mesma foto
// serve a todos os itens com esse nome.
import { buscas, melhor } from "@/lib/fotoPorNome";

export const runtime = "nodejs";

const LOJAS = ["www.savegnago.com.br", "www.mambo.com.br"];
const SEMANA = 60 * 60 * 24 * 7;

type Produto = { productName?: string; items?: { images?: { imageUrl?: string }[] }[] };
type Candidato = { nome: string; url: string };

async function buscar(loja: string, q: string): Promise<Candidato[]> {
  try {
    const r = await fetch(
      `https://${loja}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=0&_to=14`,
      { headers: { "user-agent": "MercadoMensal/1.0 (app de dispensa domestica)" }, signal: AbortSignal.timeout(6000), next: { revalidate: SEMANA } },
    );
    if (!r.ok) return [];
    const lista = (await r.json()) as Produto[];
    return lista.flatMap((p) => {
      const url = p.items?.[0]?.images?.[0]?.imageUrl;
      return p.productName && url ? [{ nome: p.productName, url }] : [];
    });
  } catch {
    return [];
  }
}

// Do mais especifico ao mais geral; para na primeira busca que achar um produto bom.
async function achar(nome: string): Promise<string | null> {
  for (const q of buscas(nome)) {
    const todos = (await Promise.all(LOJAS.map((l) => buscar(l, q)))).flat();
    const m = melhor(nome, todos);
    // VTEX entrega miniatura pelo caminho: /ids/123/ -> /ids/123-160-160/
    if (m) return m.url.replace(/\/ids\/(\d+)\//, "/ids/$1-160-160/");
  }
  return null;
}

export async function GET(req: Request) {
  const nome = (new URL(req.url).searchParams.get("nome") ?? "").trim().slice(0, 80);
  if (nome.length < 2) return new Response(null, { status: 400 });
  const url = await achar(nome);
  if (!url)
    // sem foto boa: a tela mostra o icone da categoria
    return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  return new Response(null, {
    status: 302,
    headers: { location: url, "cache-control": `public, max-age=${SEMANA}, s-maxage=${SEMANA}` },
  });
}
