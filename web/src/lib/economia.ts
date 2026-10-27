// Aba Economia: contas do mes, sem tela. Tudo puro para testar.
import { categoriaDe } from "./categorias";
import { melhorQue, type Oferta } from "./ofertas";

export type CompraMes = {
  id: string;
  name: string;
  brand?: string | null;
  qty: number;
  unit: string;
  price: number;
  total: number;
  at: string;
};

export type MesEconomia = {
  mes: string; // YYYY-MM-01
  atual: boolean;
  primeiro_mes: string | null;
  orcamento: number | null;
  gasto: number;
  compras: CompraMes[];
  historico: { name: string; media: number; vezes: number }[];
  meses: { mes: string; gasto: number; orcamento: number | null }[];
};

// O mesmo item comprado em dias diferentes vira uma linha: "arroz, 3 kg, R$ 54".
export type ItemMes = { nome: string; qty: number; unit: string; total: number; preco: number; compras: CompraMes[] };

export function agrupar(compras: CompraMes[]): ItemMes[] {
  const m = new Map<string, ItemMes>();
  for (const c of compras) {
    const k = c.name.trim().toLowerCase();
    const i = m.get(k) ?? { nome: c.name.trim(), qty: 0, unit: c.unit, total: 0, preco: 0, compras: [] };
    i.qty += Number(c.qty);
    i.total += Number(c.total);
    i.compras.push(c);
    m.set(k, i);
  }
  return [...m.values()].map((i) => ({ ...i, preco: i.qty > 0 ? i.total / i.qty : 0 })).sort((a, b) => b.total - a.total);
}

export function porCategoria(itens: ItemMes[], ofertas: Oferta[] = []) {
  const g = new Map<string, { categoria: string; total: number; itens: ItemMes[] }>();
  for (const i of itens) {
    const cat = categoriaDe(i.nome, ofertas);
    const x = g.get(cat) ?? { categoria: cat, total: 0, itens: [] };
    x.total += i.total;
    x.itens.push(i);
    g.set(cat, x);
  }
  return [...g.values()].sort((a, b) => b.total - a.total);
}

// Quanto teria saido mais barato com as ofertas desta semana, item a item e por mercado.
// Oferta por menos de 40% do que foi pago quase sempre e outro produto (embalagem menor,
// marca de outra faixa): fica de fora, para a conta nao prometer economia que nao existe.
export function emOutroMercado(itens: ItemMes[], ofertas: Oferta[]) {
  const achados = itens
    .map((i) => {
      const r = melhorQue(ofertas, i.nome, i.preco, i.unit);
      if (!r || r.economia > i.preco * 0.6) return null;
      return { item: i, oferta: r.oferta, economia: r.economia * i.qty };
    })
    .filter((x): x is { item: ItemMes; oferta: Oferta; economia: number } => !!x && x.economia >= 0.5)
    .sort((a, b) => b.economia - a.economia);
  const mercados = new Map<string, { mercado: string; economia: number; itens: number }>();
  for (const a of achados) {
    const m = mercados.get(a.oferta.mercado) ?? { mercado: a.oferta.mercado, economia: 0, itens: 0 };
    m.economia += a.economia;
    m.itens += 1;
    mercados.set(a.oferta.mercado, m);
  }
  return {
    total: achados.reduce((t, a) => t + a.economia, 0),
    achados,
    mercados: [...mercados.values()].sort((a, b) => b.economia - a.economia),
  };
}

// Contra o proprio historico: pagou menos (ou mais) que a media dos 6 meses anteriores.
// Folga de 3% para nao chamar centavo de economia.
export function deCostume(itens: ItemMes[], historico: MesEconomia["historico"]) {
  const media = new Map(historico.map((h) => [h.name.trim().toLowerCase(), Number(h.media)]));
  const linhas = itens
    .map((i) => {
      const m = media.get(i.nome.toLowerCase());
      if (!m || !(i.preco > 0)) return null;
      return { item: i, media: m, diferenca: (m - i.preco) * i.qty };
    })
    .filter((x): x is { item: ItemMes; media: number; diferenca: number } => !!x && Math.abs(x.item.preco - x.media) / x.media >= 0.03);
  const abaixo = linhas.filter((l) => l.diferenca > 0).sort((a, b) => b.diferenca - a.diferenca);
  const acima = linhas.filter((l) => l.diferenca < 0).sort((a, b) => a.diferenca - b.diferenca);
  return {
    abaixo,
    acima,
    economizou: abaixo.reduce((t, l) => t + l.diferenca, 0),
    pagouAMais: -acima.reduce((t, l) => t + l.diferenca, 0),
  };
}

// Mes corrente: quanto ainda da para gastar por semana ate o fim do mes.
export function ritmo(gasto: number, orcamento: number | null, hoje = new Date()) {
  if (!orcamento) return null;
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const dias = ultimo - hoje.getDate() + 1;
  const sobra = orcamento - gasto;
  return { dias, sobra, porSemana: sobra > 0 ? (sobra / dias) * 7 : 0 };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
export function somarMes(mes: string, n: number): string {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
