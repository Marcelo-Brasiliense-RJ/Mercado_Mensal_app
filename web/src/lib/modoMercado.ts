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

export function setModoMercado(ligado: boolean): void {
  memoria = ligado;
  try {
    if (ligado) localStorage.setItem(CHAVE, "1");
    else localStorage.removeItem(CHAVE);
  } catch {}
  window.dispatchEvent(new Event(EVENTO));
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
type Trocas = { trip: string; itens: Record<string, string> }; // id da lista -> nome no carrinho
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
  const itens = t.trip === tripId ? { ...t.itens } : {};
  if (nomeCarrinho) itens[listaId] = nomeCarrinho;
  else delete itens[listaId];
  gravarTrocas({ trip: tripId, itens });
}

export function limparTrocas(): void {
  gravarTrocas({ trip: "", itens: {} });
}

// ---------- organizar por categoria ----------
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Mesmo produto: nome igual (sem acento/caixa), como o finalizar casa a lista.
export const mesmoNome = (a: string, b: string) => norm(a) === norm(b);

// Parecido o bastante para perguntar "e o mesmo?": as regras do `parecidos` (2 palavras
// em comum) ou o mesmo tipo de produto (primeira palavra que identifica: "desinfetante
// veja" x "desinfetante pinho sol"). Quem chama garante a mesma categoria.
export function parecido(a: string, b: string): boolean {
  if (mesmoNome(a, b)) return false;
  if (parecidos(a, [{ name: b }]).length) return true;
  const pa = palavras(a)[0];
  return !!pa && pa === palavras(b)[0];
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
  let vsPesquisado = 0;
  for (const i of pendentes) {
    const g = grupo(categoria(i.name));
    const c = carrinho.find((t) => mesmoNome(t.name, i.name));
    const est = i.estimated_price && i.estimated_price > 0 ? i.estimated_price : null;
    if (c) {
      usados.add(c.id);
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
