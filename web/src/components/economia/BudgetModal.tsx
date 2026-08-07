"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";

export function BudgetModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { budget, setBudget, showToast } = useStore();
  const [valor, setValor] = useState(String(budget.total || ""));

  async function save() {
    const n = Number(valor.replace(/[^0-9,.-]/g, "").replace(",", "."));
    if (!n || n <= 0) return;
    const r = await setBudget(n);
    if (!r.ok) return showToast(r.erro);
    showToast("Orçamento atualizado");
    onClose();
  }

  const valid = Number(valor.replace(/[^0-9,.-]/g, "").replace(",", ".")) > 0;

  return (
    <Modal open={open} onClose={onClose} maxWidth={420}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="mb-1.5 text-[19px] font-extrabold">Definir orçamento</div>
      <div className="mb-[18px] text-[14px] text-text-2">
        Quanto você quer gastar de mercado neste mês?
      </div>
      <label className="mb-1.5 block text-xs font-bold text-text-2">
        Valor do orçamento
      </label>
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        inputMode="decimal"
        placeholder="R$ 800,00"
        className="mb-5 h-[52px] w-full rounded-[14px] border border-border bg-card-2 px-3.5 text-[17px] font-bold"
        autoFocus
      />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!valid}
          className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          Salvar
        </button>
      </div>
      </form>
    </Modal>
  );
}
