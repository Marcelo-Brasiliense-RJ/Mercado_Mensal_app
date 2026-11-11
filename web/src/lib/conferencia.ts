// Conferencia carrinho x nota fiscal: o que foi anotado no mercado contra o que foi
// cobrado no caixa. Pedido do dono: "o carrinho da um valor e o caixa sempre da outro,
// quase sempre maior". A conta explica a diferenca em tres partes:
//   - esqueceu de anotar: na nota e nao no carrinho;
//   - preco/quantidade diferente: anotou um valor, o caixa cobrou outro;
//   - nao veio na nota: anotou e nao foi cobrado (ou o nome na nota e outro).
// Pura, para testar sem tela.
import { mesmoProduto, palavras } from "./prateleira";

export type ItemCarrinho = { name: string; quantity: number; unit: string; unit_price: number };
export type ItemNota = { nome: string; marca?: string; qtd: number; preco: number; unidade: string };
export type Par = { c: ItemCarrinho; n: ItemNota; dif: number };

export type Conferencia = {
  iguais: Par[];
  diferentes: Par[]; // valor da linha mudou (preco ou quantidade)
  soNaNota: ItemNota[];
  soNoCarrinho: ItemCarrinho[];
  totalCarrinho: number;
  totalNota: number;
  partes: { esquecidos: number; diferencas: number; naoCobrados: number };
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const linhaC = (c: ItemCarrinho) => r2(Number(c.quantity) * Number(c.unit_price));
const linhaN = (n: ItemNota) => r2(Number(n.qtd) * Number(n.preco));

function casa(c: ItemCarrinho, n: ItemNota): boolean {
  if (mesmoProduto(c.name, n.nome)) return true;
  if (n.marca && mesmoProduto(c.name, `${n.nome} ${n.marca}`)) return true;
  // "leite italac" no carrinho x "leite" na nota: a primeira palavra (o produto) basta
  // quando so um lado traz a marca.
  const pc = palavras(c.name);
  const pn = palavras(n.nome);
  return pc.length > 0 && pn.length > 0 && pc[0] === pn[0] && (pc.length === 1 || pn.length === 1);
}

export function conferir(carrinho: ItemCarrinho[], nota: ItemNota[], totalNotaImpresso = 0): Conferencia {
  const livres = carrinho.map((c, i) => ({ c, i }));
  const pares: Par[] = [];
  const soNaNota: ItemNota[] = [];
  // Mais caros primeiro: erro de casamento em item barato pesa menos.
  for (const n of [...nota].sort((a, b) => linhaN(b) - linhaN(a))) {
    const cands = livres.filter((x) => casa(x.c, n));
    if (!cands.length) {
      soNaNota.push(n);
      continue;
    }
    // Entre os candidatos, o de valor mais perto (duas marcas de arroz no carrinho).
    cands.sort((a, b) => Math.abs(linhaC(a.c) - linhaN(n)) - Math.abs(linhaC(b.c) - linhaN(n)));
    const esc = cands[0];
    livres.splice(livres.indexOf(esc), 1);
    pares.push({ c: esc.c, n, dif: r2(linhaN(n) - linhaC(esc.c)) });
  }
  const soNoCarrinho = livres.map((x) => x.c);
  const iguais = pares.filter((p) => Math.abs(p.dif) < 0.05);
  const diferentes = pares.filter((p) => Math.abs(p.dif) >= 0.05).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
  const totalCarrinho = r2(carrinho.reduce((t, c) => t + linhaC(c), 0));
  const somaNota = r2(nota.reduce((t, n) => t + linhaN(n), 0));
  return {
    iguais,
    diferentes,
    soNaNota: soNaNota.sort((a, b) => linhaN(b) - linhaN(a)),
    soNoCarrinho,
    totalCarrinho,
    totalNota: totalNotaImpresso > 0 ? r2(totalNotaImpresso) : somaNota,
    partes: {
      esquecidos: r2(soNaNota.reduce((t, n) => t + linhaN(n), 0)),
      diferencas: r2(diferentes.reduce((t, p) => t + p.dif, 0)),
      naoCobrados: r2(soNoCarrinho.reduce((t, c) => t + linhaC(c), 0)),
    },
  };
}

export const valorLinhaNota = linhaN;
export const valorLinhaCarrinho = linhaC;

// Retrato do carrinho ao finalizar: a nota pode ser lida depois (em casa), e o
// carrinho ja foi limpo pelo banco. Fica no aparelho por 2 dias.
const CHAVE = "ultima_compra_v1";
const VALIDADE_MS = 2 * 24 * 3600 * 1000;
export type UltimaCompra = { quando: number; itens: ItemCarrinho[] };

export function guardarUltimaCompra(itens: ItemCarrinho[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ quando: Date.now(), itens } satisfies UltimaCompra));
  } catch {
    /* sem armazenamento: a conferencia vale so agora */
  }
}

export function lerUltimaCompra(agora = Date.now()): UltimaCompra | null {
  try {
    const u = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as UltimaCompra | null;
    return u && agora - u.quando < VALIDADE_MS && u.itens?.length ? u : null;
  } catch {
    return null;
  }
}

export function esquecerUltimaCompra() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada */
  }
}
