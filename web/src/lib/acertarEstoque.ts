// "Tenho X" / contagem da prateleira: o estoque PASSA A SER X (nao soma X). A RPC do
// estoque soma, entao manda a diferenca para o que ja estava. Um lugar so, para a voz,
// o texto e a foto da prateleira contarem igual.
import { findByName, unitFor } from "./defaults";
import { mesmoProduto } from "./prateleira";
import type { StockItem } from "./types";
import type { RpcResult } from "./store";

type Add = (item: { name: string; qty: number; unit: string }) => Promise<RpcResult>;

// O produto do estoque que e "esse": nome igual, singular/plural, ou o generico da casa
// ("leite" no estoque recebe a contagem de "leite italac": estoque e por produto).
export function produtoDoEstoque(nome: string, stock: StockItem[]): StockItem | undefined {
  const n = nome.trim();
  return (
    findByName(n, stock) ??
    findByName(n.replace(/s$/, ""), stock) ??
    findByName(`${n}s`, stock) ??
    stock.find((s) => mesmoProduto(s.name, n))
  );
}

// modo: "substituir" (padrao, contagem: fica X) ou "somar" (chegou X a mais).
export async function acertarEstoque(
  itens: { nome: string; qtd: number; unidade: string; modo?: "somar" | "substituir" }[],
  stock: StockItem[],
  addStock: Add,
): Promise<{ ok: string[]; falhou: string[] }> {
  const ok: string[] = [];
  const falhou: string[] = [];
  for (const it of itens) {
    const nome = it.nome.trim();
    if (!nome) continue;
    const achado = produtoDoEstoque(nome, stock);
    const delta = it.modo === "somar" ? Number(it.qtd) : +(Number(it.qtd) - (achado?.current ?? 0)).toFixed(3);
    const unidade = achado?.unit ?? it.unidade;
    if (Math.abs(delta) > 1e-9) {
      const r = await addStock({ name: achado?.name ?? nome, qty: delta, unit: unidade });
      if (!r.ok) {
        falhou.push(nome);
        continue;
      }
    }
    ok.push(`${achado?.name ?? nome} ${it.modo === "somar" ? `+${it.qtd}` : it.qtd} ${unidade}`);
  }
  return { ok, falhou };
}

// Modo "Atualizar estoque": cada item falado vira uma linha DE (o que o app tem
// hoje) -> PARA (o que a pessoa disse). Nome e unidade vem do estoque quando o
// produto ja existe, para a atualizacao cair no item certo. Falou o mesmo produto
// duas vezes: vale a ultima ("arroz 3... nao, arroz 4").
export type LinhaDePara = {
  nome: string;
  de: number | null;
  para: number;
  unidade: string;
  // Nao disse quanto ("ainda tem arroz"): PARA nasce igual ao DE e a tela pergunta.
  conferir?: boolean;
  // "Acabou o X": zera aqui e tambem vai para a lista.
  lista?: boolean;
  // Unidade falada diferente da do cadastro e sem conversao ("2 pacotes" de arroz em kg).
  aviso?: string;
};

const NAO_E_PRODUTO = /^(estoque|despensa|dispensa|armario|armário|geladeira|freezer)$/i;

// Conversao entre a unidade falada e a do cadastro: "meia duzia" de ovos com o
// estoque em un = 6; "500 gramas" de cafe em kg = 0,5.
const FATOR: Record<string, number> = { "dz>un": 12, "un>dz": 1 / 12, "kg>g": 1000, "g>kg": 0.001, "l>ml": 1000, "ml>l": 0.001 };
export function converter(qtd: number, de: string, para: string): number | null {
  const a = de.toLowerCase();
  const b = para.toLowerCase();
  if (a === b) return qtd;
  const f = FATOR[`${a}>${b}`];
  return f ? +(qtd * f).toFixed(3) : null;
}

export function linhasDePara(
  itens: { nome: string; qtd: number; unidade: string; semQtd?: boolean; zerou?: boolean }[],
  stock: StockItem[],
): LinhaDePara[] {
  const porNome = new Map<string, LinhaDePara>();
  for (const it of itens) {
    const nome = it.nome.trim();
    if (!nome || NAO_E_PRODUTO.test(nome)) continue;
    const achado = produtoDoEstoque(nome, stock);
    // "Acabou" de algo que nem esta no estoque: nada a zerar (a lista cuida).
    if (it.zerou && !achado) continue;
    const unidade = achado?.unit ?? it.unidade;
    const falado = Math.max(0, Number(it.qtd) || 0);
    let para = it.zerou ? 0 : falado;
    let aviso: string | undefined;
    if (!it.zerou && !it.semQtd && achado) {
      const conv = converter(falado, it.unidade, unidade);
      if (conv != null) para = conv;
      // Unidade que a pessoa nao disse vem do nome (palpite): ai nao avisa.
      else if (it.unidade !== unitFor(nome) && it.unidade !== "un")
        aviso = `você falou ${fmt(falado)} ${it.unidade}`;
    }
    const linha: LinhaDePara = {
      nome: achado?.name ?? nome,
      de: achado ? achado.current : null,
      para: it.semQtd ? (achado?.current ?? 1) : para,
      unidade,
      ...(it.semQtd ? { conferir: true } : {}),
      ...(it.zerou ? { lista: true } : {}),
      ...(aviso ? { aviso } : {}),
    };
    const chave = linha.nome.toLowerCase();
    porNome.delete(chave);
    porNome.set(chave, linha);
  }
  return [...porNome.values()];
}

function fmt(n: number): string {
  return String(+n.toFixed(2)).replace(".", ",");
}
