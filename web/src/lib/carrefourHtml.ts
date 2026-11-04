// Carrefour Mercado bloqueia a API de catalogo para servidor (Cloudflare 503), mas as
// paginas de busca e de categoria do site abrem normal, com os cartoes de produto no
// HTML. Aqui le esses cartoes: nome, preco, preco riscado, foto e link.
// Se o site mudar o HTML, isto devolve lista vazia (a tela avisa "sem resposta").

export type ItemHtml = { nome: string; preco: number; de: number | null; url: string; foto: string | null };

const BASE = "https://mercado.carrefour.com.br";
const reais = (s: string | undefined) => (s ? Number(s.replace(/\./g, "").replace(",", ".")) : NaN);
const texto = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .trim();

export function lerCartoes(html: string): ItemHtml[] {
  const saida: ItemHtml[] = [];
  const partes = html.split('data-testid="search-product-card"');
  for (let i = 1; i < partes.length; i++) {
    const antes = partes[i - 1].slice(-600);
    const href = antes.match(/href="([^"]+)"[^>]*$/)?.[1];
    const c = partes[i].slice(0, 5000);
    const nome = c.match(/<h2[^>]*>([^<]+)<\/h2>/)?.[1];
    const preco = reais(c.match(/text-price-default[^>]*>R\$\s*([\d.,]+)/)?.[1]);
    const de = reais(c.match(/line-through[^>]*>R\$\s*([\d.,]+)/)?.[1]);
    const foto = c.match(/<img[^>]+src="([^"]+)"/)?.[1];
    if (!href || !nome || !(preco > 0)) continue;
    saida.push({
      nome: texto(nome),
      preco,
      de: de > preco ? de : null,
      url: href.startsWith("http") ? href : `${BASE}${href}`,
      foto: foto ? texto(foto).replace(/-200-auto\//, "-300-auto/").replace(/&quality=\d+&width=\d+&height=\d+/, "") : null,
    });
  }
  return saida;
}

export const paginaCarrefour = (args: { categoria?: string; q?: string; pagina?: number }) => {
  const p = new URLSearchParams();
  if (!args.q) p.set("sort", "discount_desc");
  if (args.pagina && args.pagina > 1) p.set("page", String(args.pagina));
  const caminho = args.q ? `/busca/${encodeURIComponent(args.q)}` : `/categoria/${args.categoria}`;
  return `${BASE}${caminho}${p.size ? `?${p}` : ""}`;
};
