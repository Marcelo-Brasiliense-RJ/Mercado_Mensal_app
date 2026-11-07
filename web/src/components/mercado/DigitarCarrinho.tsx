"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { brl } from "@/lib/format";
import { unitFor } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import { mesmoNome } from "@/lib/modoMercado";

// Por no carrinho escrevendo. Campos nascem preenchidos (regra 2): unidade pelo nome,
// preco da ultima compra ou do que estava na lista. Preco e opcional (0021).
export function DigitarCarrinho({ onClose }: { onClose: () => void }) {
  const { addTripItem, showToast, stock, shopping } = useStore();
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("1");
  const [preco, setPreco] = useState("");
  const [mexeuPreco, setMexeuPreco] = useState(false);
  const [busy, setBusy] = useState(false);

  const unidade = unitFor(nome);
  const conhecido =
    stock.find((s) => mesmoNome(s.name, nome))?.priceLast ??
    shopping.find((s) => s.status === "pending" && mesmoNome(s.name, nome))?.estimated_price ??
    null;
  const precoTxt = mexeuPreco ? preco : conhecido ? String(conhecido).replace(".", ",") : "";
  const q = Number(qtd.replace(",", ".")) || 0;
  const p = precoTxt ? Number(precoTxt.replace(",", ".")) : null;
  const valido = nome.trim().length > 1 && q > 0 && (p === null || p >= 0);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setBusy(true);
    const r = await addTripItem({ name: nome.trim(), qty: q, price: p, unit: unidade });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`✅ ${nome.trim()} no carrinho`);
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth={420}>
      <form onSubmit={salvar}>
        <div className="mb-4 text-[19px] font-extrabold">🛒 Pôr no carrinho</div>
        <label className="mb-1.5 block text-xs font-bold text-text-2">O que pegou</label>
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: detergente"
          className="mb-3.5 h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]"
        />
        <label className="mb-1.5 block text-xs font-bold text-text-2">Quantidade ({unidade})</label>
        <div className="mb-3.5">
          <QtyStepper value={qtd} onChange={setQtd} unit={unidade} />
        </div>
        <label className="mb-1.5 block text-xs font-bold text-text-2">Preço por {unidade} (opcional)</label>
        <input
          value={precoTxt}
          onChange={(e) => {
            setMexeuPreco(true);
            setPreco(e.target.value);
          }}
          inputMode="decimal"
          placeholder="R$ 0,00"
          className="mb-2 h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]"
        />
        {p != null && p > 0 && q > 0 && <div className="mb-4 text-[13px] font-bold text-text-2">Fica em {brl(q * p)}</div>}
        <button
          data-rodape
          type="submit"
          disabled={busy || !valido}
          className="mb-3 mt-2 h-[50px] w-full rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-50"
        >
          {busy ? "Pondo…" : "Pôr no carrinho"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Cancelar
        </button>
      </form>
    </Modal>
  );
}
