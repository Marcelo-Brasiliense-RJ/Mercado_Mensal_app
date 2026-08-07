"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ItemGrid, type GridItem, type GridField } from "@/components/receipt/ItemGrid";
import { unitFor, findByName } from "@/lib/defaults";
import { useStore } from "@/lib/store";

// Cadastrar a despensa inteira numa tela so. Antes eram 8 passos e dois modais
// empilhados POR ITEM, com o modal fechando a cada um. A grade e a mesma da
// revisao da nota fiscal (ItemGrid), sem preco: adicionar ao estoque nao e
// registrar compra.
const vazia = (): GridItem => ({ nome: "", qtd: 1, preco: 0, unidade: "un" });

export function BatchAddModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addStock, showToast, stock } = useStore();
  const [items, setItems] = useState<GridItem[]>([vazia(), vazia(), vazia()]);
  const [saving, setSaving] = useState(false);

  function patch(i: number, field: GridField, value: string) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i
          ? {
              ...it,
              ...(field === "nome"
                ? { nome: value, unidade: unitFor(value) }
                : { [field]: Number(value.replace(",", ".")) || 0 }),
            }
          : it,
      ),
    );
  }

  function remove(i: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [vazia()]));
  }

  // Mesmo aviso do modal de item unico: duplicado so aparecia depois de salvar.
  function avisoDe(nome: string) {
    const jaTem = findByName(nome, stock);
    return jaTem ? `Você já tem ${jaTem.current} ${jaTem.unit} em casa. Vamos somar.` : null;
  }

  function close() {
    onClose();
    setItems([vazia(), vazia(), vazia()]);
    setSaving(false);
  }

  const preenchidos = items.filter((i) => i.nome.trim());

  // ponytail: um addStock por linha, em serie. Cada um recarrega os dados, entao
  // 10 itens custam 10 idas. O upgrade e uma RPC de lote (tarefa C1, mercado_lote),
  // que ainda nao existe; ate la o laco resolve e mantem o erro por item visivel.
  async function confirmar() {
    if (!preenchidos.length) return;
    setSaving(true);
    for (const it of preenchidos) {
      const r = await addStock({
        name: it.nome.trim(),
        qty: Number(it.qtd) || 1,
        unit: it.unidade,
      });
      if (!r.ok) {
        setSaving(false);
        return showToast(r.erro);
      }
    }
    showToast(
      preenchidos.length === 1
        ? `${preenchidos[0].nome.trim()} adicionado ao estoque`
        : `${preenchidos.length} itens adicionados ao estoque`,
    );
    close();
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="mb-1 text-[20px] font-extrabold">Adicionar ao estoque</div>
      <p className="mb-3.5 text-[14px] leading-relaxed text-text-2">
        Escreva um item por linha. A unidade vem do nome e as linhas em branco são
        ignoradas.
      </p>

      <ItemGrid
        items={items}
        onPatch={patch}
        onRemove={remove}
        onAddRow={() => setItems((prev) => [...prev, vazia()])}
        precos={false}
        avisoDe={avisoDe}
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={close}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={saving || preenchidos.length === 0}
          className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          {saving
            ? "Salvando..."
            : `Adicionar${preenchidos.length ? ` (${preenchidos.length})` : ""}`}
        </button>
      </div>
    </Modal>
  );
}
