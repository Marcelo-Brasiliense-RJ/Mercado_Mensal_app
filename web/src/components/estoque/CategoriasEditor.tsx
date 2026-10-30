"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { categoriaDoItem, PADRAO, salvarCategorias, useCategorias, type Categoria } from "./useCategorias";

// Ajustes > Categorias do estoque: renomear, criar, excluir, trocar o icone e a ordem.
// Renomear leva os itens junto; excluir devolve os itens ao palpite pelo nome (ou Outros).
type Linha = Categoria & { antigo?: string; chave: number };

export function CategoriasEditor({ onClose }: { onClose: () => void }) {
  const cats = useCategorias();
  const { stock, showToast, reloadData, setCategoria } = useStore();
  const [linhas, setLinhas] = useState<Linha[]>(() => cats.map((c, i) => ({ ...c, antigo: c.nome, chave: i })));
  const [busy, setBusy] = useState(false);
  const conta = (nome?: string) => (nome ? stock.filter((s) => categoriaDoItem(s, cats) === nome).length : 0);

  const mudar = (i: number, p: Partial<Linha>) => setLinhas((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const mover = (i: number, d: number) =>
    setLinhas((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const n = [...l];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  async function salvar() {
    setBusy(true);
    // Itens que estao na categoria so pelo palpite do nome (sem escolha gravada) tambem
    // acompanham a troca de nome: grava a categoria nova neles depois de salvar.
    const renomes = new Map(linhas.filter((x) => x.antigo && x.antigo !== x.nome.trim()).map((x) => [x.antigo!, x.nome.trim()]));
    const levar = stock
      .filter((s) => !s.category && renomes.has(categoriaDoItem(s, cats)))
      .map((s) => [s.id, renomes.get(categoriaDoItem(s, cats))!] as const);
    const erro = await salvarCategorias(
      linhas.map((x) => ({ nome: x.nome.trim(), icone: x.icone.trim() || "🛒", antigo: x.antigo })),
    );
    setBusy(false);
    if (erro) return showToast(erro);
    await Promise.all(levar.map(([id, c]) => setCategoria(id, c)));
    await reloadData(); // itens renomeados/excluidos voltam do banco com a categoria nova
    showToast("Categorias salvas");
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth={480}>
      <div className="pr-12 text-[20px] font-extrabold">🗂 Categorias do estoque</div>
      <p className="mb-3 text-[13px] text-text-2">
        Renomeie, troque o ícone, mude a ordem (a do corredor) ou exclua. Itens de uma categoria excluída voltam para a
        categoria pelo nome, ou Outros.
      </p>

      <div className="flex flex-col gap-1.5">
        {linhas.map((x, i) => {
          const outros = x.antigo === "Outros";
          return (
            <div key={x.chave} className="flex items-center gap-1.5 rounded-[12px] border border-border bg-card p-1.5">
              <input
                value={x.icone}
                onChange={(e) => mudar(i, { icone: e.target.value.slice(0, 4) })}
                aria-label="Ícone"
                className="h-10 w-11 shrink-0 rounded-[10px] bg-card-2 text-center text-[20px]"
              />
              <div className="min-w-0 flex-1">
                <input
                  value={x.nome}
                  onChange={(e) => mudar(i, { nome: e.target.value })}
                  disabled={outros}
                  placeholder="Nome da categoria"
                  aria-label="Nome da categoria"
                  className="h-10 w-full rounded-[10px] bg-card-2 px-2.5 text-[15px] font-bold disabled:opacity-70"
                />
                {x.antigo && <div className="px-1 text-[11px] text-text-3">{conta(x.antigo)} itens</div>}
              </div>
              <button onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="h-10 w-8 shrink-0 text-[16px] disabled:opacity-25">
                ↑
              </button>
              <button
                onClick={() => mover(i, 1)}
                disabled={i === linhas.length - 1}
                aria-label="Descer"
                className="h-10 w-8 shrink-0 text-[16px] disabled:opacity-25"
              >
                ↓
              </button>
              <button
                onClick={() => setLinhas((l) => l.filter((_, j) => j !== i))}
                disabled={outros}
                aria-label={`Excluir ${x.nome}`}
                className="h-10 w-9 shrink-0 text-[16px] disabled:opacity-20"
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setLinhas((l) => [...l.slice(0, -1), { nome: "", icone: "🛒", chave: Date.now() }, ...l.slice(-1)])}
        className="mt-2 h-11 w-full rounded-[12px] border-2 border-dashed border-brand text-[14px] font-bold text-brand"
      >
        + Nova categoria
      </button>
      <button
        onClick={() => setLinhas(PADRAO.map((c, i) => ({ ...c, antigo: cats.some((x) => x.nome === c.nome) ? c.nome : undefined, chave: 1000 + i })))}
        className="mt-1 h-9 w-full text-[13px] font-bold text-text-2 underline"
      >
        Voltar às categorias padrão
      </button>

      <div data-rodape className="mt-2 flex gap-2">
        <button onClick={onClose} className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold">
          Cancelar
        </button>
        <button
          onClick={salvar}
          disabled={busy || linhas.some((x) => !x.nome.trim())}
          className="h-[50px] flex-[2] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
