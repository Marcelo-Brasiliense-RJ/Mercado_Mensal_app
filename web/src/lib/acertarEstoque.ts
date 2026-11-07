// "Tenho X" / contagem da prateleira: o estoque PASSA A SER X (nao soma X). A RPC do
// estoque soma, entao manda a diferenca para o que ja estava. Um lugar so, para a voz,
// o texto e a foto da prateleira contarem igual.
import { findByName } from "./defaults";
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
export type LinhaDePara = { nome: string; de: number | null; para: number; unidade: string };

const NAO_E_PRODUTO = /^(estoque|despensa|dispensa|armario|armário|geladeira|freezer)$/i;

export function linhasDePara(
  itens: { nome: string; qtd: number; unidade: string }[],
  stock: StockItem[],
): LinhaDePara[] {
  const porNome = new Map<string, LinhaDePara>();
  for (const it of itens) {
    const nome = it.nome.trim();
    if (!nome || NAO_E_PRODUTO.test(nome)) continue;
    const achado = produtoDoEstoque(nome, stock);
    const linha: LinhaDePara = {
      nome: achado?.name ?? nome,
      de: achado ? achado.current : null,
      para: Math.max(0, Number(it.qtd) || 0),
      unidade: achado?.unit ?? it.unidade,
    };
    const chave = linha.nome.toLowerCase();
    porNome.delete(chave);
    porNome.set(chave, linha);
  }
  return [...porNome.values()];
}
