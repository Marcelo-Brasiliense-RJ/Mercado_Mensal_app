// Pontos Livelo (0046): ponto e dinheiro. Um parceiro um pouco mais caro que pontua pode
// sair mais barato que o encarte. Puro, para testar; o estado vem de useLivelo.
import { casaItem, maisBarato, padrao, type Oferta } from "./ofertas";
import { categoriaDe } from "./categorias";

export type Paridade = {
  codigo: string;
  nome: string | null;
  pontos: number;
  pontos_clube: number;
  pontos_normal: number;
  promocao: boolean;
  ate: boolean; // "ate N pts": o maximo vale so para parte dos produtos
  regra: string | null;
  atualizado_em: string;
};
export type PrecoLivelo = { item: string; parceiro: string; preco: number; visto_em: string };
export type Livelo = {
  configurado: boolean;
  valor_ponto: number;
  clube: boolean;
  parceiros: string[];
  paridades: Paridade[];
  fixos: string[];
  precos: PrecoLivelo[];
  mes: { pontos: number; gasto: number; compras: number };
  por_parceiro: { parceiro: string; pontos: number; itens: string }[];
};

// Pontos que a compra rende com certeza. Em campanha "ate 7", so parte dos produtos ganha
// o maximo: a conta usa o normal e a tela mostra o "ate" como bonus.
export function ptsCertos(p: Paridade, clube: boolean): number {
  if (p.ate) return p.pontos_normal;
  return clube ? Math.max(p.pontos_clube, p.pontos) : p.pontos;
}
export const ptsMax = (p: Paridade, clube: boolean) => (clube ? Math.max(p.pontos_clube, p.pontos) : p.pontos);

export const valorPontos = (preco: number, pts: number, valorPonto: number) => preco * pts * valorPonto;
export const liquido = (preco: number, pts: number, valorPonto: number) => preco - valorPontos(preco, pts, valorPonto);

export const paridadeDe = (l: Livelo, codigo: string) => l.paridades.find((p) => p.codigo === codigo);
export const nomeParceiro = (l: Livelo, codigo: string) => paridadeDe(l, codigo)?.nome ?? codigo;

// Os precos digitados viram "ofertas" de um mercado a mais: a Lista compara sem saber
// que e Livelo. preco_de = o que se paga; preco_por = pago menos o valor dos pontos.
export function ofertasLivelo(l: Livelo): Oferta[] {
  return l.precos
    .filter((x) => l.parceiros.includes(x.parceiro))
    .map((x, i) => {
      const p = paridadeDe(l, x.parceiro);
      const pts = p ? Math.round(x.preco * ptsCertos(p, l.clube)) : 0; // pontos inteiros, como a Livelo credita
      return {
        id: -1 - i,
        mercado: `livelo:${x.parceiro}`,
        produto: x.item,
        marca: "",
        tamanho: "",
        categoria: categoriaDe(x.item),
        preco_por: Math.round((x.preco - pts * l.valor_ponto) * 100) / 100,
        preco_de: x.preco,
        condicao: `+${pts} pts Livelo`,
        fim: null,
        tem_foto: false,
      };
    });
}

export type Comparacao = {
  mercado: Oferta | null; // melhor encarte
  livelo: { parceiro: string; preco: number; liquido: number; pts: number; visto_em: string } | null;
  vence: "livelo" | "mercado" | null;
  diferenca: number; // quanto o vencedor economiza por unidade
};

// Fixo do mes: o melhor encarte contra o melhor parceiro da Livelo, ja com os pontos.
export function comparar(item: string, ofertas: Oferta[], l: Livelo): Comparacao {
  const mercado = ofertas.filter((o) => casaItem(o, item)).sort(maisBarato)[0] ?? null;
  const k = padrao(item);
  const livelo =
    l.precos
      .filter((x) => padrao(x.item) === k && l.parceiros.includes(x.parceiro))
      .map((x) => {
        const p = paridadeDe(l, x.parceiro);
        const pts = p ? Math.round(x.preco * ptsCertos(p, l.clube)) : 0;
        return { parceiro: x.parceiro, preco: x.preco, liquido: x.preco - pts * l.valor_ponto, pts, visto_em: x.visto_em };
      })
      .sort((a, b) => a.liquido - b.liquido)[0] ?? null;
  if (!mercado || !livelo) return { mercado, livelo, vence: livelo ? "livelo" : mercado ? "mercado" : null, diferenca: 0 };
  const d = mercado.preco_por - livelo.liquido;
  return { mercado, livelo, vence: d > 0.005 ? "livelo" : "mercado", diferenca: Math.abs(d) };
}

// Preco digitado ha mais de 7 dias: pedir para conferir de novo.
export const precoVelho = (visto_em: string, agora = Date.now()) => agora - new Date(visto_em).getTime() > 7 * 86400000;

// Busca do produto no site do parceiro, para ver o preco. So os conhecidos.
const BUSCA: Record<string, (q: string) => string> = {
  CRM: (q) => `https://mercado.carrefour.com.br/busca/${encodeURIComponent(q)}`,
  CRF: (q) => `https://www.carrefour.com.br/busca/${encodeURIComponent(q)}`,
  EXT: (q) => `https://www.extra.com.br/${encodeURIComponent(q)}/b`,
  MZL: (q) => `https://www.magazineluiza.com.br/busca/${encodeURIComponent(q)}/`,
};
export const linkBusca = (parceiro: string, item: string) => BUSCA[parceiro]?.(item) ?? null;
// A compra so pontua entrando pelo site da Livelo.
export const LINK_LIVELO = "https://www.livelo.com.br/ganhe-pontos-compre-e-pontue";
