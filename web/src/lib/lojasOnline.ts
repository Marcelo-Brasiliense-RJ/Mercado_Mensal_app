// Lojas online que pontuam na Livelo e mostram o catalogo aberto (VTEX, com CORS liberado).
// Pedido do dono: uma vitrine de ofertas de coisas de casa (mercado, limpeza, casa, eletro,
// lazer), com destaque para o que esta na lista e no estoque.
// Testes de nov/2026:
// - Carrefour bloqueia servidor (Cloudflare 503, ate no GitHub Actions); a busca sai do
//   celular da pessoa, que costuma passar. Se nao passar, as outras lojas seguem.
// - Sam's Club e Midea respondem de qualquer lugar.
// - Bloqueiam tudo: Mercado Livre, Magalu, Shopee, Extra, Casas Bahia, Petlove, Petz.
// - So entregam longe do Rio: Supernosso (BH), Angeloni (SC).
// - Brastemp, Consul, Electrolux e Telhanorte: o "desconto" e lixo (pecas, R$ 0,04).
// Farmacias ficam prontas mas desligadas: o dono vai abrir esse ramo (remedios) depois.
// Loja nova = uma linha aqui (codigo da Livelo + site VTEX).
import { produtoCasa } from "./comparar";

export type Chip = "mercado" | "limpeza" | "casa" | "eletro" | "lazer";
export const CHIPS: { id: Chip; nome: string; emoji: string }[] = [
  { id: "mercado", nome: "Mercado", emoji: "🛒" },
  { id: "limpeza", nome: "Limpeza", emoji: "🧽" },
  { id: "casa", nome: "Casa", emoji: "🛋️" },
  { id: "eletro", nome: "Eletro", emoji: "🔌" },
  { id: "lazer", nome: "Lazer", emoji: "⚽" },
];

export type Loja = {
  codigo: string; // codigo do parceiro na Livelo (pontos por real vem de la, sozinho)
  nome: string;
  emoji: string;
  site: string;
  slug: string; // pagina do parceiro na Livelo: e por la que a compra pontua
  ptsPadrao: number; // pt/R$ sem campanha, se a tabela da Livelo nao carregar
  tipo: "mercado" | "casa" | "farmacia";
  ativa: boolean;
  // Vitrine: categorias do site por chip (fq=C:/id/). Sem isso, pega os maiores descontos
  // do site inteiro e separa pelo departamento.
  categorias?: Partial<Record<Chip, number[]>>;
  chipFixo?: Chip; // loja de um ramo so (Midea = eletro)
  obs?: string;
};

export const TODAS_LOJAS: Loja[] = [
  {
    codigo: "CRM",
    nome: "Carrefour",
    emoji: "🛒",
    site: "https://mercado.carrefour.com.br",
    slug: "carrefour",
    ptsPadrao: 1,
    tipo: "mercado",
    ativa: true,
  },
  {
    codigo: "ECO",
    nome: "Sam's Club",
    emoji: "📦",
    site: "https://www.samsclub.com.br",
    slug: "sams-club-e-commerce",
    ptsPadrao: 1,
    tipo: "mercado",
    ativa: true,
    obs: "precisa ser sócio",
    categorias: {
      mercado: [6, 7, 4, 10, 24],
      limpeza: [12, 13],
      casa: [16, 20, 19, 18],
      eletro: [22, 21, 23],
      lazer: [17, 25, 15],
    },
  },
  {
    codigo: "MDI",
    nome: "Midea",
    emoji: "🔌",
    site: "https://www.midea.com.br",
    slug: "midea",
    ptsPadrao: 1,
    tipo: "casa",
    ativa: true,
    chipFixo: "eletro",
  },
  {
    codigo: "DPC",
    nome: "Pacheco",
    emoji: "💊",
    site: "https://www.drogariaspacheco.com.br",
    slug: "drogarias-pacheco",
    ptsPadrao: 1,
    tipo: "farmacia",
    ativa: false,
  },
  {
    codigo: "DPS",
    nome: "Drogaria SP",
    emoji: "💊",
    site: "https://www.drogariasaopaulo.com.br",
    slug: "drogaria-sao-paulo",
    ptsPadrao: 1,
    tipo: "farmacia",
    ativa: false,
  },
];

// As que a tela usa agora. Ligar farmacia = ativa: true la em cima.
export const LOJAS = TODAS_LOJAS.filter((l) => l.ativa);
export const lojaDe = (codigo: string) => TODAS_LOJAS.find((l) => l.codigo === codigo);
export const linkLivelo = (l: Loja) => `https://www.livelo.com.br/juntar-pontos/parceiros/${l.slug}/${l.codigo}`;

export type OfertaOnline = { loja: string; preco: number; pts: number };

// A melhor loja online para o item: a que sai mais barata depois de descontar os pontos.
export function melhorOnline(ofertas: OfertaOnline[], valorPonto: number): OfertaOnline | null {
  const liq = (o: OfertaOnline) => o.preco - Math.round(o.preco * o.pts) * valorPonto;
  return ofertas.filter((o) => o.preco > 0).sort((a, b) => liq(a) - liq(b))[0] ?? null;
}

// "Campanha válida de 03 a 05/11/2026" -> "05/11": ate quando vale a promocao.
export function fimCampanha(regra: string | null | undefined): string | null {
  const datas = [...(regra ?? "").matchAll(/(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?/g)].map((m) => m[1]);
  return datas.at(-1) ?? null;
}

// ---------- Vitrine ----------

export type Produto = {
  id: string; // loja:productId
  loja: string;
  nome: string;
  preco: number;
  de: number | null;
  desconto: number; // 0..1
  url: string | null;
  foto: string | null;
  chip: Chip | null;
};

type Vtex = {
  productId?: string;
  productName?: string;
  linkText?: string;
  categories?: string[];
  items?: {
    images?: { imageUrl?: string }[];
    sellers?: { commertialOffer?: { Price?: number; ListPrice?: number; AvailableQuantity?: number } }[];
  }[];
};

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Departamento do site -> chip. O que nao e de casa (moda, carro...) fica de fora.
const DEPTO: [RegExp, Chip][] = [
  [/limpeza|higiene|beleza|perfumaria|lavanderia|descartave/, "limpeza"],
  [/eletro|informatica|celular|tv |televis|games|ar e ventila|climatiza/, "eletro"],
  [/cama|mesa|banho|utilidade|movei|decora|casa|cozinha|jardim|ferrament|pet/, "casa"],
  [/esporte|lazer|brinquedo|sazonal|bebe|kids|camping|piscina|festa/, "lazer"],
  [/mercearia|bebida|vinho|acougue|hortifruti|congelad|frios|laticin|padaria|saudave|importad|doce|matinal|biscoito|cafe/, "mercado"],
];
export function chipDoDepto(depto: string): Chip | null {
  const d = sem(depto);
  return DEPTO.find(([re]) => re.test(d))?.[1] ?? null;
}

export function produtosVtex(lista: unknown, loja: Loja, chip: Chip | null = null): Produto[] {
  if (!Array.isArray(lista)) return [];
  const saida: Produto[] = [];
  for (const p of lista as Vtex[]) {
    const nome = (p.productName ?? "").trim();
    const item = p.items?.[0];
    const o = item?.sellers?.[0]?.commertialOffer;
    if (!nome || !o?.Price || o.Price < 2 || !o.AvailableQuantity) continue;
    const de = o.ListPrice && o.ListPrice > o.Price + 0.01 ? o.ListPrice : null;
    const desconto = de ? 1 - o.Price / de : 0;
    if (desconto > 0.85) continue; // "R$ 59,90 por R$ 0,09": erro de cadastro
    const depto = (p.categories ?? []).map((c) => c.split("/").filter(Boolean)[0] ?? "").find(Boolean) ?? "";
    saida.push({
      id: `${loja.codigo}:${p.productId ?? nome}`,
      loja: loja.codigo,
      nome,
      preco: o.Price,
      de,
      desconto,
      url: p.linkText ? `${loja.site}/${p.linkText}/p` : null,
      foto: item?.images?.[0]?.imageUrl?.replace(/\/ids\/(\d+)\//, "/ids/$1-300-300/") ?? null,
      chip: chip ?? loja.chipFixo ?? chipDoDepto(depto),
    });
  }
  return saida;
}

// Endereco da busca no catalogo do site.
export function urlBusca(loja: Loja, args: { q?: string; fq?: string; ate?: number }): string {
  const p = new URLSearchParams();
  if (args.q) p.set("ft", args.q);
  else p.set("O", "OrderByBestDiscountDESC");
  if (args.fq) p.set("fq", args.fq);
  p.set("_from", "0");
  p.set("_to", String(args.ate ?? 23));
  return `${loja.site}/api/catalog_system/pub/products/search?${p}`;
}

// Destaque: o produto e de algo da lista ou do estoque da casa?
export function marcaDe(nome: string, lista: string[], estoque: string[]): "lista" | "estoque" | null {
  if (lista.some((i) => produtoCasa(nome, i))) return "lista";
  if (estoque.some((i) => produtoCasa(nome, i))) return "estoque";
  return null;
}
