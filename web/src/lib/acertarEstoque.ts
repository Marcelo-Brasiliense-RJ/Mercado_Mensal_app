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
