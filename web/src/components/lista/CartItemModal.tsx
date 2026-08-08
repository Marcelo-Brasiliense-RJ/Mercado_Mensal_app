"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { brl } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { TripItem } from "@/lib/types";

// Editar ou tirar um item que ja esta no carrinho. Popup em vez de edicao na
// propria linha: no mercado, com o celular na mao, alvo grande erra menos.
export function CartItemModal({
  item,
  onClose,
}: {
  item: TripItem | null;
  onClose: () => void;
}) {
  const { updateTripItem, removeTripItem, showToast } = useStore();
  const [qtd, setQtd] = useState("");
  const [preco, setPreco] = useState("");
  const [busy, setBusy] = useState(false);
  // Guarda o id junto para o formulario nascer preenchido com o item certo,
  // sem setState dentro de effect.
  const [carregado, setCarregado] = useState<string | null>(null);

  if (!item) return null;

  if (carregado !== item.id) {
    setCarregado(item.id);
    setQtd(String(item.quantity));
    setPreco(String(item.unit_price));
  }

  const q = Number(qtd.replace(",", "."));
  const p = Number(preco.replace(",", "."));
  const valido = q > 0 && p >= 0;

  async function salvar() {
    if (!valido) return showToast("Quantidade e preço precisam ser válidos.");
    setBusy(true);
    const r = await updateTripItem(item!.id, { qty: q, price: p });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name} atualizado`);
    onClose();
  }

  async function excluir() {
    setBusy(true);
    const r = await removeTripItem(item!.id);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name} saiu do carrinho`);
    onClose();
  }

  return (
    <Modal open={!!item} onClose={onClose} maxWidth={420}>
      <div className="mb-1 text-[19px] font-extrabold">{item.name}</div>
      <div className="mb-4 text-[13px] text-text-2">
        No carrinho por {brl(item.quantity * item.unit_price)}
      </div>

      <label className="mb-1.5 block text-xs font-bold text-text-2">
        Quantidade ({item.unit})
      </label>
      <div className="mb-3.5">
        <QtyStepper value={qtd} onChange={setQtd} unit={item.unit} />
      </div>

      <label className="mb-1.5 block text-xs font-bold text-text-2">
        Preço por {item.unit}
      </label>
      <input
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        inputMode="decimal"
        placeholder="R$ 0,00"
        className="mb-2 h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]"
      />
      {valido && (
        <div className="mb-4 text-[13px] font-bold text-text-2">
          Fica em {brl(q * p)}
        </div>
      )}

      <button
        type="button"
        onClick={salvar}
        disabled={busy || !valido}
        className="mb-3 h-[50px] w-full rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
      >
        Salvar alterações
      </button>
      <button
        type="button"
        onClick={excluir}
        disabled={busy}
        className="mb-3 h-[50px] w-full rounded-[14px] border border-neg bg-card text-[15px] font-bold text-neg disabled:opacity-50"
      >
        Tirar do carrinho
      </button>
      <button
        type="button"
        onClick={onClose}
        className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[15px] font-bold"
      >
        Cancelar
      </button>
    </Modal>
  );
}