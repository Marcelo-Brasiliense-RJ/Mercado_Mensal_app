"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { termoEvitar } from "@/lib/ofertas";
import { marcarRuim } from "@/components/ofertas/useEvitar";
import type { StockItem } from "@/lib/types";

// Excluir do estoque pergunta o porque: so tirar (acabou, nao uso mais) ou tirar e por
// no "Não compro" (era ruim: some das ofertas e o leitor avisa se pegar de novo).
export function ConfirmarExclusao({
  itens,
  onClose,
  onFeito,
}: {
  itens: StockItem[];
  onClose: () => void;
  onFeito?: () => void;
}) {
  const { deleteStock, showToast } = useStore();
  const [busy, setBusy] = useState(false);
  const um = itens.length === 1;
  const titulo = um ? itens[0].name : `${itens.length} itens`;

  async function excluir(ruim: boolean) {
    setBusy(true);
    const r = await deleteStock(itens.map((i) => i.id));
    if (r.ok && ruim) for (const i of itens) await marcarRuim({ termo: termoEvitar(i.name), nome: i.name });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(ruim ? `👎 ${titulo}: excluído e no Não compro` : `${titulo} excluído do estoque`);
    onFeito?.();
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth={400}>
      <div className="pr-10 text-[20px] font-extrabold capitalize">Excluir {titulo}?</div>
      <p className="mb-4 text-[13px] text-text-2">
        {um ? "Sai do estoque." : "Saem do estoque."} Se for porque é ruim, ponha no Não compro: some das ofertas.
      </p>
      <div className="flex flex-col gap-2.5">
        <button
          onClick={() => excluir(false)}
          disabled={busy}
          className="h-[52px] rounded-[14px] bg-neg text-[15px] font-bold text-white disabled:opacity-50"
        >
          🗑 Só excluir do estoque
        </button>
        <button
          onClick={() => excluir(true)}
          disabled={busy}
          className="h-[52px] rounded-[14px] border-2 border-neg bg-card text-[15px] font-bold text-neg disabled:opacity-50"
        >
          👎 Excluir e pôr no Não compro
        </button>
        <button onClick={onClose} className="h-12 rounded-[14px] border border-border bg-card text-[15px] font-bold">
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
