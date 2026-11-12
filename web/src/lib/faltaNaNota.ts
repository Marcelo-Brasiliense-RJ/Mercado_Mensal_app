// "Falta 1 item" na nota lida (pedido do dono, 2026-11-12): quantos itens do cupom foram
// lidos, em %, onde fica na nota o que faltou e sugestoes de produto ao preencher.
// Parte pura, usada por components/receipt/FaltaNaNota.tsx.
import { contarItens } from "./cupomPartes";

export type LinhaNota = { nome: string; marca?: string; qtd: number; unidade: string; preco: number; n?: number };

export function prova(itens: Pick<LinhaNota, "qtd" | "unidade" | "n">[], noCupom: number) {
  if (!(noCupom > 0)) return null;
  const { lidos, porLinha } = contarItens(itens, noCupom);
  // 45 de 46 = 97,8%: arredonda para BAIXO, para nao mostrar 100% sem bater
  const pct = lidos === noCupom ? 100 : Math.min(99, Math.floor((Math.min(lidos, noCupom) / noCupom) * 100));
  // cupom que numera os itens e conta por linha: os numeros que nao vieram SAO os que faltam
  const vistos = new Set(itens.map((i) => i.n ?? 0));
  const numerados = porLinha && itens.some((i) => i.n);
  const semNumero = numerados ? Array.from({ length: noCupom }, (_, k) => k + 1).filter((n) => !vistos.has(n)).slice(0, 20) : [];
  return { lidos, noCupom, pct, falta: Math.max(0, noCupom - lidos), sobra: Math.max(0, lidos - noCupom), porLinha, semNumero };
}

// Linhas da lista que ficam em volta: depoisDe = n (1..) da linha logo acima, 0 = topo.
export function ondeFica(itens: Pick<LinhaNota, "nome">[], depoisDe: number): { acima: string; abaixo: string } {
  return { acima: depoisDe > 0 ? itens[depoisDe - 1]?.nome ?? "" : "", abaixo: itens[depoisDe]?.nome ?? "" };
}

// Insere na ordem do cupom (a proxima "segunda olhada" manda a lista em ordem).
export function inserirNaOrdem<T>(itens: T[], novo: T, depoisDe: number): T[] {
  const i = Math.min(Math.max(0, depoisDe), itens.length);
  return [...itens.slice(0, i), novo, ...itens.slice(i)];
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Produtos da casa que combinam com o que a pessoa digita: comeca com > alguma palavra
// comeca com > contem. Ate 5.
export function sugerirProdutos<T extends { name: string }>(texto: string, produtos: T[], max = 5): T[] {
  const q = sem(texto);
  if (q.length < 2) return [];
  const nota = (p: T) => {
    const n = sem(p.name);
    if (n.startsWith(q)) return 3;
    if (n.split(/\s+/).some((w) => w.startsWith(q))) return 2;
    return n.includes(q) ? 1 : 0;
  };
  return produtos
    .map((p) => ({ p, n: nota(p) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.p.name.length - b.p.name.length)
    .slice(0, max)
    .map((x) => x.p);
}
