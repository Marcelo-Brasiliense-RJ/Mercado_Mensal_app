// A resposta principal da Livelo (pedido do dono): comprando pela Livelo eu ganho ou
// perco, comparado com o mercado? O preco do mercado e aproximado: encarte de hoje, senao
// o preco da lista, senao o ultimo que a casa pagou. Puro, para testar.
import { findByName } from "./defaults";
import { casaItem, maisBarato, nomeMercado, pontuaNaLivelo, type Oferta } from "./ofertas";
import { ehDoItem, palavras } from "./lojasOnline";

export type PrecoMercado = { preco: number; fonte: string; oferta: Oferta | null; item: string };

type ComNome = { name: string };
type Estoque = ComNome & { priceLast: number | null };
type Lista = ComNome & { estimated_price: number | null };

// Termos para achar o mesmo item no mercado, do mais certeiro ao mais solto.
export function termosDe(nome: string, itemDaCasa: string | null): string[] {
  const p = palavras(nome);
  return [...new Set([itemDaCasa, p.slice(0, 2).join(" "), p[0]].filter((t): t is string => !!t))];
}

export function precoNoMercado(
  nome: string,
  itemDaCasa: string | null,
  ofertas: Oferta[],
  estoque: Estoque[],
  lista: Lista[],
): PrecoMercado | null {
  for (const termo of termosDe(nome, itemDaCasa)) {
    const o = ofertas.filter((x) => !pontuaNaLivelo(x.mercado) && casaItem(x, termo)).sort(maisBarato)[0];
    if (o) return { preco: o.preco_por, fonte: `encarte ${nomeMercado(o.mercado)}`, oferta: o, item: termo };
  }
  const daLista = lista.find((i) => i.estimated_price && ehDoItem(nome, i.name));
  if (daLista?.estimated_price) return { preco: daLista.estimated_price, fonte: "preço da sua lista", oferta: null, item: daLista.name };
  const est =
    (itemDaCasa ? findByName(itemDaCasa, estoque) : undefined) ?? estoque.find((s) => s.priceLast && ehDoItem(nome, s.name));
  if (est?.priceLast) return { preco: est.priceLast, fonte: "último que você pagou", oferta: null, item: est.name };
  return null;
}

export type Veredito =
  | { tipo: "livelo"; economia: number; valorPts: number } // Livelo sai mais em conta (contando os pontos)
  | { tipo: "mercado"; diferenca: number; valorPts: number } // mercado sai mais barato mesmo com os pontos
  | { tipo: "sem"; valorPts: number }; // sem preco do mercado para comparar

export function veredito(precoLivelo: number, pts: number, valorPonto: number, mercado: number | null): Veredito {
  const valorPts = +(pts * valorPonto).toFixed(2);
  if (mercado == null) return { tipo: "sem", valorPts };
  const liquido = precoLivelo - valorPts;
  if (liquido <= mercado + 0.005) return { tipo: "livelo", economia: +(mercado - liquido).toFixed(2), valorPts };
  return { tipo: "mercado", diferenca: +(liquido - mercado).toFixed(2), valorPts };
}
