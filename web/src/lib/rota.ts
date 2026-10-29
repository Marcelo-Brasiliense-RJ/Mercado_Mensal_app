// Rota da compra: em quais mercados passar (entre os da casa) e em que ordem.
// Puro, para testar; a localizacao das lojas e a abertura no mapa ficam na tela.
import { casaItem, maisBarato, type Oferta } from "./ofertas";
import { distancia } from "./lugar";

export type Parada = { mercado: string; itens: { nome: string; oferta: Oferta }[]; total: number };
export type Plano = { paradas: Parada[]; total: number; faltam: string[]; economiaVsUm: number };

// Passar num mercado a mais so vale se economizar isto, ou se pegar item que faltava.
export const VALE_A_PENA = 10;

function combinacoes<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [a, ...r] = xs;
  return [...combinacoes(r, k - 1).map((c) => [a, ...c]), ...combinacoes(r, k)];
}

function avaliar(nomes: string[], ofertas: Oferta[], mercados: string[]): Plano {
  const porMercado = new Map<string, Parada>();
  const faltam: string[] = [];
  let total = 0;
  for (const nome of nomes) {
    const o = ofertas.filter((x) => mercados.includes(x.mercado) && casaItem(x, nome)).sort(maisBarato)[0];
    if (!o) {
      faltam.push(nome);
      continue;
    }
    const p = porMercado.get(o.mercado) ?? { mercado: o.mercado, itens: [], total: 0 };
    p.itens.push({ nome, oferta: o });
    p.total += o.preco_por;
    porMercado.set(o.mercado, p);
    total += o.preco_por;
  }
  return { paradas: [...porMercado.values()], total, faltam, economiaVsUm: 0 };
}

const melhor = (a: Plano, b: Plano) => a.faltam.length - b.faltam.length || a.total - b.total;

// Melhor plano com ate `max` mercados. Cresce de 1 em 1 e para quando o mercado a mais
// nao paga a viagem (pega item novo ou economiza VALE_A_PENA).
export function planejar(nomes: string[], ofertas: Oferta[], mercados: string[], max: number): Plano | null {
  if (!nomes.length || !mercados.length) return null;
  let atual: Plano | null = null;
  let umSo: Plano | null = null;
  for (let k = 1; k <= Math.min(max, mercados.length); k++) {
    const opcoes = combinacoes(mercados, k).map((ms) => avaliar(nomes, ofertas, ms)).sort(melhor);
    const melhorK = opcoes[0];
    if (k === 1) umSo = melhorK;
    if (!atual) atual = melhorK;
    else if (melhorK.faltam.length < atual.faltam.length || atual.total - melhorK.total >= VALE_A_PENA) atual = melhorK;
    else break;
  }
  if (!atual || !atual.paradas.length) return null;
  return { ...atual, economiaVsUm: umSo && umSo.faltam.length === atual.faltam.length ? umSo.total - atual.total : 0 };
}

type Ponto = { lat: number; lng: number };

// Ordem das paradas: sempre a mais perto de onde a pessoa esta (vizinho mais proximo).
export function ordenar<T extends Ponto>(origem: Ponto, paradas: T[]): T[] {
  const resto = [...paradas];
  const out: T[] = [];
  let aqui = origem;
  while (resto.length) {
    resto.sort((a, b) => distancia(aqui, a) - distancia(aqui, b));
    aqui = resto.shift()!;
    out.push(aqui as T);
  }
  return out;
}

const ll = (p: Ponto) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

// Google Maps abre a rota inteira, com as paradas no meio, no app ou no navegador.
export function linkGoogle(origem: Ponto | null, paradas: Ponto[]): string {
  const destino = paradas[paradas.length - 1];
  const meio = paradas.slice(0, -1);
  const q = new URLSearchParams({ api: "1", destination: ll(destino), travelmode: "driving" });
  if (origem) q.set("origin", ll(origem));
  if (meio.length) q.set("waypoints", meio.map(ll).join("|"));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

// Waze so leva a um destino por vez.
export const linkWaze = (p: Ponto) => `https://waze.com/ul?ll=${ll(p)}&navigate=yes`;

// Mapas do iPhone (Apple): rota de carro ate o ponto.
export const linkApple = (p: Ponto) => `https://maps.apple.com/?daddr=${ll(p)}&dirflg=d`;

// Sem a loja no mapa: cada app procura pelo nome, perto de onde a pessoa esta.
export function linksPorNome(nome: string) {
  const q = encodeURIComponent(`Supermercado ${nome}`);
  return {
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
  };
}
