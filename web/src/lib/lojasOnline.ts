// Lojas online que pontuam na Livelo e deixam ver o preco sozinho (catalogo publico VTEX).
// Pedido do dono: todo parceiro online onde da para fazer a compra do mes.
// Testados em nov/2026 (catalogo VTEX aberto): Carrefour, Sam's Club, Pacheco, Drogaria SP.
// Fora: Supernosso (SPN, so entrega em BH) e Angeloni (so SC). Bloqueiam a consulta
// automatica: Mercado Livre (MCL), Magalu (MZL), Shopee (PEE), Extra (EXT), Casas Bahia
// (CSB), Petlove (PLV), Petz (PTZ) - entram se surgir outro jeito de ler o preco.
// Farmacias ficam prontas mas desligadas: o dono vai abrir esse ramo (remedios) depois.
// Loja nova = uma linha aqui (codigo da Livelo + site VTEX).

export type Loja = {
  codigo: string; // codigo do parceiro na Livelo (pontos por real vem de la, sozinho)
  nome: string;
  emoji: string;
  site: string;
  slug: string; // pagina do parceiro na Livelo: e por la que a compra pontua
  ptsPadrao: number; // pt/R$ sem campanha, se a tabela da Livelo nao carregar
  tipo: "mercado" | "farmacia";
  ativa: boolean;
  obs?: string;
};

export const TODAS_LOJAS: Loja[] = [
  { codigo: "CRM", nome: "Carrefour", emoji: "🛒", site: "https://mercado.carrefour.com.br", slug: "carrefour", ptsPadrao: 1, tipo: "mercado", ativa: true },
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
  },
  { codigo: "DPC", nome: "Pacheco", emoji: "💊", site: "https://www.drogariaspacheco.com.br", slug: "drogarias-pacheco", ptsPadrao: 1, tipo: "farmacia", ativa: false },
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
