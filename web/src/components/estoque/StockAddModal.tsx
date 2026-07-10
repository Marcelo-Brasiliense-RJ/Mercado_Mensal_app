"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";

const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];
const field =
  "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const labelCls = "mb-1.5 block text-xs font-bold text-text-2";

// Adiciona item direto ao estoque (sem registrar compra: nao mexe no gasto do
// mes). Por isso nao ha campo de preco.
export function StockAddModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addStock, showToast } = useStore();
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("1");
  const [unidade, setUnidade] = useState("un");

  function close() {
    onClose();
    setNome("");
    setQtd("1");
    setUnidade("un");
  }

  async function submit() {
    if (!nome.trim()) return;
    await addStock({
      name: nome.trim(),
      qty: Number(qtd.replace(",", ".")) || 1,
      unit: unidade,
    });
    showToast(`${nome.trim()} adicionado ao estoque`);
    close();
  }

  const valid = nome.trim().length > 0;

  return (
    <Modal open={open} onClose={close} maxWidth={420}>
      <div className="mb-[18px] text-[19px] font-extrabold">Adicionar ao estoque</div>

      <label className={labelCls}>Nome</label>
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Ex.: Arroz"
        className={`${field} mb-3.5`}
        autoFocus
      />

      <div className="mb-5 flex gap-3">
        <div className="flex-1">
          <label className={labelCls}>Quantidade</label>
          <input
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            inputMode="decimal"
            placeholder="1"
            className={field}
          />
        </div>
        <div className="w-[120px]">
          <label className={labelCls}>Unidade</label>
          <select
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            className={`${field} px-2.5`}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={close}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={!valid}
          className="h-[50px] flex-[1.6] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
    </Modal>
  );
}
