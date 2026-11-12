// Modo mercado: a aba do carrinho, separada da Lista.
//
// Por que existe: com o carrinho crescendo, a Lista (que mistura montar a lista,
// ofertas, rota e carrinho) fica dificil de controlar no corredor. O modo mercado e
// uma aba propria, so de pegar: por categoria, o que ja esta no carrinho, o que
// falta e quanto esta dando. Fica escondida ate a pessoa ligar o interruptor na Lista.
//
// Aqui so a parte pura (testavel) e o liga/desliga no aparelho. A tela fica em
// components/mercado/MercadoView.tsx.
import { useSyncExternalStore } from "react";
import { palavras } from "./fotoPorNome";
import { parecidos } from "./parecidos";
import type { ShopItem, TripItem } from "./types";

// ---------- liga/desliga (no aparelho) ----------
// ponytail: preferencia do aparelho em localStorage, nao da familia no banco. Cada um
// liga no proprio celular; se a casa quiser o modo para todos, vira coluna em households.
const CHAVE = "modo_mercado_v1";
const EVENTO = "modo-mercado";
let memoria = false; // aba privada sem localStorage: vale ate fechar o app

function ler(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return memoria;
  }
}

const DESDE = "modo_mercado_desde";
const ESQUECIDO_MS = 12 * 60 * 60 * 1000;

export function setModoMercado(ligado: boolean): void {
  memoria = ligado;
  try {
    if (ligado) {
      localStorage.setItem(CHAVE, "1");
      localStorage.setItem(DESDE, String(Date.now()));
    } else {
      localStorage.removeItem(CHAVE);
      localStorage.removeItem(DESDE);
    }
  } catch {}
  window.dispatchEvent(new Event(EVENTO));
}

// Modo ligado ha mais de 12 h com o carrinho vazio = esquecido ligado (ninguem fica 12 h
// no mercado sem pegar nada). Sem a hora gravada (ligado antes desta versao), tambem
// conta como esquecido. Carrinho com itens nunca desliga sozinho.
export function modoMercadoEsquecido(itensNoCarrinho: number, agora = Date.now(), desde?: number | null): boolean {
  if (itensNoCarrinho > 0) return false;
  let d = desde;
  if (d === undefined) {
    try {
      d = Number(localStorage.getItem(DESDE)) || null;
    } catch {
      d = null;
    }
  }
  return !d || agora - d > ESQUECIDO_MS;
}

function ouvir(f: () => void) {
  window.addEventListener(EVENTO, f);
  window.addEventListener("storage", f);
  return () => {
    window.removeEventListener(EVENTO, f);
    window.removeEventListener("storage", f);
  };
}

export function useModoMercado(): boolean {
  return useSyncExternalStore(ouvir, ler, () => false);
}

// ---------- "e o mesmo" (troca de marca) ----------
// Item da lista que a pessoa disse que ja foi coberto por outro do carrinho
// ("pedi Veja, peguei Pinho Sol"). Vale so para a compra aberta: guardado com o id
// dela. No finalizar, a tela tira esses itens da lista (o carrinho repoe o estoque).
const CHAVE_TROCAS = "mercado_trocas_v1";
const EVENTO_TROCAS = "mercado-trocas";
// itens: id da lista -> nome no carrinho. nao: pares "id da lista|nome no carrinho" que a
// pessoa ja respondeu "Nao, nao e o mesmo" (a pergunta nao volta nesta compra).
type Trocas = { trip: string; itens: Record<string, string>; nao?: string[] };
let trocasMem: Trocas = { trip: "", itens: {} };
let trocasCache: { cru: string | null; v: Trocas } = { cru: null, v: trocasMem };

function lerTrocas(): Trocas {
  try {
    const cru = localStorage.getItem(CHAVE_TROCAS);
    if (cru === trocasCache.cru) return trocasCache.v;
    const v = cru ? (JSON.parse(cru) as Trocas) : { trip: "", itens: {} };
    trocasCache = { cru, v: v && typeof v.itens === "object" ? v : { trip: "", itens: {} } };
    return trocasCache.v;
  } catch {
    return trocasMem;
  }
}

function gravarTrocas(t: Trocas) {
  trocasMem = t;
  try {
    localStorage.setItem(CHAVE_TROCAS, JSON.stringify(t));
  } catch {}
  window.dispatchEvent(new Event(EVENTO_TROCAS));
}

function ouvirTrocas(f: () => void) {
  window.addEventListener(EVENTO_TROCAS, f);
  window.addEventListener("storage", f);
  return () => {
    window.removeEventListener(EVENTO_TROCAS, f);
    window.removeEventListener("storage", f);
  };
}

const VAZIO: Record<string, string> = {};

// Trocas da compra aberta (de outra compra nao valem).
export function useTrocas(tripId: string | null): Record<string, string> {
  const t = useSyncExternalStore(ouvirTrocas, lerTrocas, () => trocasMem);
  return tripId && t.trip === tripId ? t.itens : VAZIO;
}

export function marcarTroca(tripId: string, listaId: string, nomeCarrinho: string | null): void {
  const t = lerTrocas();
  const mesma = t.trip === tripId;
  const itens = mesma ? { ...t.itens } : {};
  if (nomeCarrinho) itens[listaId] = nomeCarrinho;
  else delete itens[listaId];
  gravarTrocas({ trip: tripId, itens, nao: mesma ? t.nao : [] });
}

export function naoEoMesmo(tripId: string, listaId: string, nomeCarrinho: string): void {
  const t = lerTrocas();
  const mesma = t.trip === tripId;
  const nao = [...(mesma ? (t.nao ?? []) : []), `${listaId}|${norm(nomeCarrinho)}`];
  gravarTrocas({ trip: tripId, itens: mesma ? t.itens : {}, nao });
}

const SEM_NAO: string[] = [];
export function useNaoEoMesmo(tripId: string | null): string[] {
  const t = useSyncExternalStore(ouvirTrocas, lerTrocas, () => trocasMem);
  return tripId && t.trip === tripId ? (t.nao ?? SEM_NAO) : SEM_NAO;
}
export const chaveNao = (listaId: string, nomeCarrinho: string) => `${listaId}|${norm(nomeCarrinho)}`;

export function limparTrocas(): void {
  gravarTrocas({ trip: "", itens: {} });
}

// ---------- organizar por categoria ----------
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Mesmo produto: nome igual (sem acento/caixa), como o finalizar casa a lista.
export const mesmoNome = (a: string, b: string) => norm(a) === norm(b);

// Primeira palavra que sozinha nao diz o produto: "gel dental" x "gel adesivo sanitario",
// "creme de leite" x "creme dental" (visto no uso real). Com ela, so as 2 palavras em comum.
const INICIO_VAGO = new Set([
  "gel", "creme", "papel", "molho", "leite", "oleo", "agua", "pasta", "saco", "filme", "po", "massa", "doce",
  "suco", "tempero", "pao", "queijo", "carne", "bebida", "kit", "refil", "liquido", "spray", "lenco", "pano",
]);

// Parecido o bastante para perguntar "e o mesmo?": as regras do `parecidos` (2 palavras
// em comum) ou o mesmo tipo de produto (primeira palavra que identifica: "desinfetante
// veja" x "desinfetante pinho sol"). Quem chama garante a mesma categoria.
export function parecido(a: string, b: string): boolean {
  if (mesmoNome(a, b)) return false;
  if (parecidos(a, [{ name: b }]).length) return true;
  const pa = palavras(a)[0];
  return !!pa && !INICIO_VAGO.has(pa) && pa === palavras(b)[0];
}

// O item da lista esta DENTRO do nome do produto pego: lista "absorvente" e carrinho
// "absorvente diana"; lista "lava roupas" e carrinho "lava roupas liquido urca 3l". A
// foto e o codigo trazem o nome do rotulo (marca, tamanho), a lista tem o nome generico:
// sem isto tudo que entrava pela foto aparecia "fora da lista". Quem chama garante a
// mesma categoria ("leite" nao casa com "leite condensado", que e Mercearia).
export function contem(lista: string, carrinho: string): boolean {
  const pl = palavras(lista);
  if (!pl.length) return false;
  const pc = new Set(palavras(carrinho));
  return pl.every((p) => pc.has(p));
}

// Item da lista ja resolvido: pego com o mesmo nome (carrinho) ou trocado por outro.
export type LinhaPego = {
  item: ShopItem;
  carrinho?: TripItem;
  trocadoPor?: string;
  faltaQtd: number; // pegou menos do que a lista pedia (mesma unidade); 0 = completo
  diffPreco: number | null; // pago - pesquisado, por unidade; null = sem preco na lista
};
export type Sugestao = { lista: ShopItem; carrinho: TripItem };

export type GrupoMercado = {
  categoria: string;
  noCarrinho: TripItem[]; // tudo que foi pego nesta categoria
  pegos: LinhaPego[]; // itens da lista ja resolvidos (no carrinho ou trocados)
  faltam: ShopItem[]; // itens da lista que ainda nao foram pegos
  foraDaLista: TripItem[]; // pego sem estar na lista
  total: number; // R$ no carrinho nesta categoria
  falta: number; // R$ estimado do que falta (preco da lista)
};

export type ResumoMercado = {
  grupos: GrupoMercado[];
  sugestoes: Sugestao[];
  totalLista: number; // itens da lista nesta compra
  pegosLista: number;
  parciais: number; // pegos com menos do que a lista pedia
  faltaValor: number; // R$ estimado do que falta (inclui o resto dos parciais)
  valorDaLista: number; // R$ no carrinho de itens da lista
  valorFora: number; // R$ no carrinho fora da lista
  qtdFora: number;
  vsPesquisado: number; // soma de (pesquisado - pago) x qtd: >0 economizou, <0 pagou mais
  // Itens da lista cobertos por produto de OUTRO nome (troca ou "contem"). O finalizar do
  // banco so baixa a lista por nome igual; estes a tela tira da lista depois de finalizar.
  paraLimpar: string[];
};

const mesmaUnidade = (a: string, b: string) => norm(a) === norm(b);

export function montarMercado(
  lista: ShopItem[],
  carrinho: TripItem[],
  categoria: (nome: string) => string,
  trocas: Record<string, string> = {},
  ordem: (c: string) => number = () => 0,
): ResumoMercado {
  const pendentes = lista.filter((i) => i.status === "pending");
  const grupos = new Map<string, GrupoMercado>();
  const grupo = (c: string) => {
    let g = grupos.get(c);
    if (!g) {
      g = { categoria: c, noCarrinho: [], pegos: [], faltam: [], foraDaLista: [], total: 0, falta: 0 };
      grupos.set(c, g);
    }
    return g;
  };

  const usados = new Set<string>(); // ids do carrinho que casaram com a lista
  // Quem cobre cada item da lista: nome igual primeiro; depois, o produto pego que
  // contem o nome da lista (mesma categoria, sem reaproveitar o mesmo produto).
  const cobre = new Map<string, TripItem>();
  for (const i of pendentes) {
    const c = carrinho.find((t) => mesmoNome(t.name, i.name));
    if (c) {
      cobre.set(i.id, c);
      usados.add(c.id);
    }
  }
  for (const i of pendentes) {
    if (cobre.has(i.id) || trocas[i.id]) continue;
    const cat = categoria(i.name);
    const c = carrinho.find((t) => !usados.has(t.id) && categoria(t.name) === cat && contem(i.name, t.name));
    if (c) {
      cobre.set(i.id, c);
      usados.add(c.id);
    }
  }
  let vsPesquisado = 0;
  for (const i of pendentes) {
    const g = grupo(categoria(i.name));
    const c = cobre.get(i.id);
    const est = i.estimated_price && i.estimated_price > 0 ? i.estimated_price : null;
    if (c) {
      const faltaQtd = mesmaUnidade(c.unit, i.unit) ? Math.max(0, +(i.desired_quantity - c.quantity).toFixed(3)) : 0;
      const diffPreco = est != null ? +(c.unit_price - est).toFixed(2) : null;
      if (diffPreco != null) vsPesquisado += -diffPreco * c.quantity;
      if (faltaQtd > 0) g.falta += faltaQtd * (est ?? c.unit_price);
      g.pegos.push({ item: i, carrinho: c, faltaQtd, diffPreco });
    } else if (trocas[i.id]) {
      const t = carrinho.find((x) => mesmoNome(x.name, trocas[i.id]));
      if (t) usados.add(t.id);
      g.pegos.push({ item: i, carrinho: t, trocadoPor: trocas[i.id], faltaQtd: 0, diffPreco: null });
    } else {
      g.faltam.push(i);
      g.falta += i.desired_quantity * (est ?? 0);
    }
  }
  let valorFora = 0;
  let qtdFora = 0;
  for (const t of carrinho) {
    const g = grupo(categoria(t.name));
    const v = t.quantity * t.unit_price;
    g.noCarrinho.push(t);
    g.total += v;
    if (!usados.has(t.id)) {
      g.foraDaLista.push(t);
      valorFora += v;
      qtdFora++;
    }
  }

  // "Pegou X de limpeza e na lista tem Y de limpeza parecido": pergunta se e o mesmo.
  const sugestoes: Sugestao[] = [];
  for (const g of grupos.values())
    for (const f of g.faltam) {
      const c = g.foraDaLista.find((t) => parecido(f.name, t.name));
      if (c) sugestoes.push({ lista: f, carrinho: c });
    }

  // Categoria que ainda tem o que pegar vem primeiro (na ordem dos corredores); a
  // completa desce: a tela mostra primeiro o que ainda pede atencao.
  const completa = (g: GrupoMercado) => (g.faltam.length === 0 && !g.pegos.some((p) => p.faltaQtd > 0) ? 1 : 0);
  const lista_ = [...grupos.values()].sort(
    (a, b) =>
      completa(a) - completa(b) || ordem(a.categoria) - ordem(b.categoria) || a.categoria.localeCompare(b.categoria),
  );
  const total = carrinho.reduce((a, t) => a + t.quantity * t.unit_price, 0);
  return {
    grupos: lista_,
    sugestoes,
    totalLista: pendentes.length,
    pegosLista: lista_.reduce((a, g) => a + g.pegos.length, 0),
    parciais: lista_.reduce((a, g) => a + g.pegos.filter((p) => p.faltaQtd > 0).length, 0),
    faltaValor: lista_.reduce((a, g) => a + g.falta, 0),
    valorDaLista: total - valorFora,
    valorFora,
    qtdFora,
    vsPesquisado: +vsPesquisado.toFixed(2),
    paraLimpar: lista_.flatMap((g) =>
      g.pegos.filter((p) => p.trocadoPor || (p.carrinho && !mesmoNome(p.carrinho.name, p.item.name))).map((p) => p.item.id),
    ),
  };
}

// Conta do mes: ja gasto antes desta compra + carrinho + o que falta (estimado),
// contra o orcamento. E a resposta para "vai caber?" antes de chegar no caixa.
export type Conta = {
  orcamento: number; // 0 = sem orcamento
  antes: number; // gasto no mes antes desta compra
  carrinho: number;
  falta: number;
  previsto: number; // antes + carrinho + falta
  sobraAgora: number | null; // orcamento - antes - carrinho
  sobraNoFim: number | null; // orcamento - previsto
  tom: "ok" | "atencao" | "estourou" | "sem";
};

export function contaDoMes(orcamento: number, antes: number, carrinho: number, falta: number): Conta {
  const previsto = antes + carrinho + falta;
  if (!(orcamento > 0))
    return { orcamento: 0, antes, carrinho, falta, previsto, sobraAgora: null, sobraNoFim: null, tom: "sem" };
  const sobraAgora = orcamento - antes - carrinho;
  const sobraNoFim = orcamento - previsto;
  const tom = sobraAgora < 0 ? "estourou" : sobraNoFim < 0 || sobraAgora < orcamento * 0.1 ? "atencao" : "ok";
  return { orcamento, antes, carrinho, falta, previsto, sobraAgora, sobraNoFim, tom };
}

// Categoria do ultimo item que entrou no carrinho: e onde a pessoa esta agora, e o
// lembrete "aqui ainda falta..." vale mais nesse corredor.
export function corredorAtual(carrinho: TripItem[], categoria: (nome: string) => string): string | null {
  const ultimo = carrinho[carrinho.length - 1];
  return ultimo ? categoria(ultimo.name) : null;
}
