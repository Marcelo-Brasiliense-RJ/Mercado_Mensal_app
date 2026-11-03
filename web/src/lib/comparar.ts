// Mercado x Carrefour online com pontos Livelo, item a item e no total da lista.
// Puro, para testar; a tela (LiveloView) so desenha.

export type ProdutoCarrefour = {
  nome: string;
  preco: number;
  de: number | null;
  url: string | null;
  foto: string | null;
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Mesma regra do app (casaItem): a primeira palavra abre o nome, as outras em
// qualquer lugar. "arroz" casa "Arroz Tio João 5kg", nao "Bolinho de arroz".
export function produtoCasa(nome: string, termo: string): boolean {
  const n = semAcento(nome);
  const [primeira, ...resto] = semAcento(termo).split(/\s+/).filter(Boolean);
  if (!primeira) return false;
  const p1 = primeira.replace(/s$/, "");
  return n.startsWith(p1) && resto.every((p) => n.includes(p.replace(/s$/, "")));
}

// Quantas vezes o preco do produto entra na conta. Pacote/unidade multiplica; peso
// e volume nao (o produto do site ja e o pacote, "2 kg de arroz" = 1 pacote de 2kg
// na pratica). E aproximado de proposito: o dono pediu "algo bem aproximado".
export function vezes(qtd: number, unidade: string): number {
  const u = unidade.trim().toLowerCase();
  const q = Number(qtd) || 1;
  return ["un", "pct", "cx", "dz"].includes(u) ? Math.max(1, Math.round(q)) : 1;
}

export type Linha = {
  nome: string;
  vezes: number;
  mercado: number | null; // total no mercado (encarte ou o que a casa pagou)
  carrefour: number | null; // total no caixa do Carrefour online
  pontos: number; // pontos Livelo que a compra rende
  liquido: number | null; // Carrefour menos o valor dos pontos
  vence: "mercado" | "carrefour" | null;
  economia: number; // quanto o vencedor poupa nesse item
};

export function linha(args: {
  nome: string;
  vezes: number;
  precoMercado: number | null;
  precoCarrefour: number | null;
  ptsPorReal: number;
  valorPonto: number;
}): Linha {
  const { nome, vezes: n, precoMercado, precoCarrefour, ptsPorReal, valorPonto } = args;
  const mercado = precoMercado != null && precoMercado > 0 ? +(precoMercado * n).toFixed(2) : null;
  const carrefour = precoCarrefour != null && precoCarrefour > 0 ? +(precoCarrefour * n).toFixed(2) : null;
  const pontos = carrefour != null ? Math.round(carrefour * ptsPorReal) : 0; // a Livelo credita inteiro
  const liquido = carrefour != null ? +(carrefour - pontos * valorPonto).toFixed(2) : null;
  let vence: Linha["vence"] = null;
  let economia = 0;
  if (mercado != null && liquido != null) {
    vence = liquido < mercado - 0.005 ? "carrefour" : "mercado";
    economia = +Math.abs(mercado - liquido).toFixed(2);
  } else if (mercado != null) vence = "mercado";
  else if (liquido != null) vence = "carrefour";
  return { nome, vezes: n, mercado, carrefour, pontos, liquido, vence, economia };
}

export type Resumo = {
  comparados: number; // itens com os dois precos
  semPreco: number; // itens sem preco nenhum
  tudoMercado: number; // so os comparados
  tudoCarrefour: number; // no caixa, so os comparados
  tudoLiquido: number; // descontando os pontos
  pontos: number;
  melhorDeCada: number; // cada item onde sai mais barato
  ganhaCarrefour: number; // quantos itens compensam online
};

export function resumo(linhas: Linha[]): Resumo {
  const r: Resumo = {
    comparados: 0,
    semPreco: 0,
    tudoMercado: 0,
    tudoCarrefour: 0,
    tudoLiquido: 0,
    pontos: 0,
    melhorDeCada: 0,
    ganhaCarrefour: 0,
  };
  for (const l of linhas) {
    if (l.mercado == null && l.liquido == null) {
      r.semPreco += 1;
      continue;
    }
    if (l.mercado == null || l.liquido == null || l.carrefour == null) continue;
    r.comparados += 1;
    r.tudoMercado += l.mercado;
    r.tudoCarrefour += l.carrefour;
    r.tudoLiquido += l.liquido;
    r.pontos += l.pontos;
    r.melhorDeCada += Math.min(l.mercado, l.liquido);
    if (l.vence === "carrefour") r.ganhaCarrefour += 1;
  }
  for (const k of ["tudoMercado", "tudoCarrefour", "tudoLiquido", "melhorDeCada"] as const) r[k] = +r[k].toFixed(2);
  return r;
}

// Margem do dono: pagar ate R$ X a mais no caixa do Carrefour ainda vale, porque a
// compra pontua na Livelo e isso rende no longo prazo. A margem compara o que sai do
// bolso no caixa (sem descontar pontos), senao os pontos contariam duas vezes.
export const MARGEM_PADRAO = 5;

export type Veredito =
  | { tipo: "online"; aMais: number } // tudo online; aMais = quanto paga a mais no caixa (0 se mais barato)
  | { tipo: "misto"; economia: number } // separar: cada item onde sai mais barato
  | { tipo: "mercado" }
  | { tipo: "nada" }; // sem item comparavel

export function veredito(r: Resumo, margem: number): Veredito {
  if (!r.comparados) return { tipo: "nada" };
  const aMais = +(r.tudoCarrefour - r.tudoMercado).toFixed(2);
  if (aMais <= margem) return { tipo: "online", aMais: Math.max(0, aMais) };
  const economia = +(r.tudoMercado - r.melhorDeCada).toFixed(2);
  return economia > 0.01 ? { tipo: "misto", economia } : { tipo: "mercado" };
}
