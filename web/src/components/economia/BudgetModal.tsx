"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { nomeMes } from "@/lib/economia";

export function BudgetModal({
  open,
  onClose,
  mes,
}: {
  open: boolean;
  onClose: () => void;
  mes?: string; // YYYY-MM-01 do mes que vem; sem ele, o mes corrente
}) {
  const { budget, setBudget, showToast } = useStore();
  const [valor, setValor] = useState(mes ? "" : String(budget.total || ""));

  async function save() {
    const n = Number(valor.replace(/[^0-9,.-]/g, "").replace(",", "."));
    if (!n || n <= 0) return;
    if (mes) {
      const { data, error } = await createClient().rpc("mercado_budget_mes_set_web", { p_total: n, p_mes: mes });
      if (error || !(data as { ok?: boolean } | null)?.ok)
        return showToast(error?.code === "PGRST202" ? "Falta rodar a migration 0051." : "Não deu para salvar. Tente de novo.");
    } else {
      const r = await setBudget(n);
      if (!r.ok) return showToast(r.erro);
    }
    showToast("Orçamento atualizado");
    onClose();
  }

  const valid = Number(valor.replace(/[^0-9,.-]/g, "").replace(",", ".")) > 0;

  return (
    <Modal open={open} onClose={onClose} maxWidth={420}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="mb-1.5 text-[19px] font-extrabold">Definir orçamento</div>
      <div className="mb-[18px] text-[14px] text-text-2">
        Quanto você quer gastar de mercado {mes ? `em ${nomeMes(mes)}` : "neste mês"}?
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
      <div data-rodape className="flex gap-3">
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
