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

export type Chip = "mercado" | "limpeza" | "casa";
export const CHIPS: { id: Chip; nome: string; emoji: string }[] = [
  { id: "mercado", nome: "Mercado", emoji: "🛒" },
  { id: "limpeza", nome: "Limpeza", emoji: "🧽" },
  { id: "casa", nome: "Casa", emoji: "🛋️" }, // casa, eletro e lazer: separado do mercado
];

export type Loja = {
  codigo: string; // codigo do parceiro na Livelo (pontos por real vem de la, sozinho)
  nome: string;
  emoji: string;
  cor: string; // etiqueta da loja no cartao, na cor da marca
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
    cor: "#D7141A",
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
    cor: "#0067A0",
    site: "https://www.samsclub.com.br",
    slug: "sams-club-e-commerce",
    ptsPadrao: 1,
    tipo: "mercado",
    ativa: true,
    obs: "precisa ser sócio",
    categorias: {
      // Foco do dono: compra do mes. Mercado pega mais departamentos.
      mercado: [6, 7, 4, 10, 3, 9, 11, 8, 24],
      limpeza: [12, 13],
      casa: [20, 22, 16, 18, 17],
    },
  },
  {
    codigo: "MDI",
    nome: "Midea",
    emoji: "🔌",
    cor: "#00A0DF",
    site: "https://www.midea.com.br",
    slug: "midea",
    ptsPadrao: 1,
    tipo: "casa",
    ativa: true,
    chipFixo: "casa",
  },
  {
    codigo: "DPC",
    nome: "Pacheco",
    emoji: "💊",
    cor: "#E2001A",
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
    cor: "#E30613",
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
  [/eletro|informatica|celular|televis|games|ar e |climatiza|cama|mesa|banho|utilidade|movei|decora|casa|cozinha|jardim|ferrament|pet|esporte|lazer|brinquedo|sazonal|bebe|kids|camping|piscina|festa/, "casa"],
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

// Palavras que contam num nome: sem acento, sem plural, sem "de/com" e sem numero.
const PARADA = new Set(["de", "da", "do", "das", "dos", "com", "sem", "para", "tipo", "em", "kg", "ml", "und", "pct"]);
export const palavras = (s: string) =>
  sem(s)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !PARADA.has(w))
    .map((w) => w.replace(/s$/, ""));

// O que toda casa compra: entra como "Basico da casa" mesmo fora do estoque.
const BASICOS = [
  "arroz", "feijao", "frango", "carne", "contra file", "alcatra", "patinho", "picanha", "costela", "linguica",
  "ovo", "leite", "cafe", "acucar", "oleo", "azeite", "sal", "macarrao", "farinha", "pao", "manteiga",
  "margarina", "queijo", "presunto", "iogurte", "biscoito", "molho tomate", "banana", "batata", "cebola", "tomate",
  "alho", "sabao", "detergente", "amaciante", "desinfetante", "agua sanitaria", "papel higienico", "creme dental",
  "sabonete", "shampoo",
];
const PRINCIPAIS = new Set(BASICOS.map((b) => palavras(b)[0]));

// O produto e daquele item da casa? A palavra principal do item aparece no nome (nao
// precisa abrir o nome nem bater a marca: "frango sadia" acha "Filé de Peito de Frango
// Seara") e pelo menos metade das palavras do item. "Óleo de Arroz" nao e arroz: o nome
// abre com outro basico.
export function ehDoItem(nome: string, item: string): boolean {
  const ip = palavras(item);
  const np = palavras(nome);
  if (!ip.length || !np.includes(ip[0])) return false;
  if (np[0] !== ip[0] && PRINCIPAIS.has(np[0])) return false;
  return ip.filter((w) => np.includes(w)).length * 2 >= ip.length;
}

export type Marca = "lista" | "estoque" | "basico" | null;
// Destaque: o produto e de algo da lista, do estoque ou do basico de toda casa?
export function marcaDe(nome: string, lista: string[], estoque: string[]): Marca {
  if (lista.some((i) => ehDoItem(nome, i))) return "lista";
  if (estoque.some((i) => ehDoItem(nome, i))) return "estoque";
  if (BASICOS.some((i) => ehDoItem(nome, i))) return "basico";
  return null;
}

// Termo para achar o mesmo produto nas outras lojas: as 3 primeiras palavras do nome.
export const chaveProduto = (nome: string) => palavras(nome).slice(0, 3).join(" ");

// Busca da pessoa: todas as palavras no nome, sem acento ("iogurte grego" acha
// "Iogurte Grego Vigor").
export function casaBusca(nome: string, termo: string): boolean {
  const n = sem(nome);
  return sem(termo).split(/\s+/).filter(Boolean).every((p) => n.includes(p.replace(/s$/, "")));
}
