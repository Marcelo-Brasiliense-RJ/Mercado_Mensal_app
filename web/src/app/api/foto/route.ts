// Foto de um item da casa pelo NOME ("arroz", "pao de forma"), para o estoque e a lista
// terem cara de produto. Busca no catalogo publico de lojas VTEX (mesma fonte do codigo
// de barras) e redireciona para a imagem, ja em tamanho de miniatura.
//
// Prefere o resultado cujo nome comeca com o item ("alho" nao vira "tempero alho").
// Uma busca por nome, guardada uma semana pela borda e pelo navegador: a mesma foto
// serve a todos os itens com esse nome.
export const runtime = "nodejs";

const LOJAS = ["www.savegnago.com.br", "www.mambo.com.br"];
const SEMANA = 60 * 60 * 24 * 7;

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Produto = { productName?: string; items?: { images?: { imageUrl?: string }[] }[] };

async function buscar(loja: string, nome: string): Promise<string | null> {
  const r = await fetch(
    `https://${loja}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(nome)}&_from=0&_to=9`,
    { headers: { "user-agent": "MercadoMensal/1.0 (app de dispensa domestica)" }, signal: AbortSignal.timeout(6000), next: { revalidate: SEMANA } },
  );
  if (!r.ok) throw new Error(String(r.status));
  const lista = (await r.json()) as Produto[];
  const n = sem(nome);
  const certo = lista.find((p) => sem(p.productName ?? "").startsWith(n)) ??
    lista.find((p) => sem(p.productName ?? "").startsWith(n.split(" ")[0]));
  const url = (certo ?? lista[0])?.items?.[0]?.images?.[0]?.imageUrl;
  if (!url) throw new Error("sem foto");
  // VTEX entrega miniatura pelo caminho: /ids/123/ -> /ids/123-160-160/
  return url.replace(/\/ids\/(\d+)\//, "/ids/$1-160-160/");
}

export async function GET(req: Request) {
  const nome = (new URL(req.url).searchParams.get("nome") ?? "").trim().slice(0, 60);
  if (nome.length < 2) return new Response(null, { status: 400 });
  try {
    const url = await Promise.any(LOJAS.map((l) => buscar(l, nome)));
    return new Response(null, {
      status: 302,
      headers: { location: url!, "cache-control": `public, max-age=${SEMANA}, s-maxage=${SEMANA}` },
    });
  } catch {
    // sem foto: a tela mostra o icone da categoria
    return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  }
}
