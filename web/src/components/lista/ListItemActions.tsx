"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import type { ShopItem } from "@/lib/types";

// Acoes ao clicar num item da lista: comprei (repoe estoque), baixa por consumo
// (so quando ja tenho o item em estoque, casado pelo nome) e tirar da lista.
export function ListItemActions({
  item,
  onClose,
  onComprar,
  onRemover,
}: {
  item: ShopItem | null;
  onClose: () => void;
  onComprar: (id: string) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
}) {
  const { stock, zerarStock, baixaStock, showToast } = useStore();
  const [parcial, setParcial] = useState(false);
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);

  function fechar() {
    setParcial(false);
    setQtd("");
    onClose();
  }
  if (!item) return null;

  // So da pra dar baixa por consumo se o item existe no estoque (casa por nome).
  const emEstoque = stock.find(
    (s) => s.name.toLowerCase() === item.name.toLowerCase(),
  );

  async function comprar() {
    setBusy(true);
    await onComprar(item!.id);
    setBusy(false);
    fechar();
  }
  async function remover() {
    setBusy(true);
    await onRemover(item!.id);
    setBusy(false);
    fechar();
  }
  async function baixaTotal() {
    if (!emEstoque) return;
    setBusy(true);
    await zerarStock([emEstoque.id]);
    setBusy(false);
    showToast(`${item!.name}: baixa total`);
    fechar();
  }
  async function baixaParcial() {
    const n = Number(qtd.replace(",", "."));
    if (!emEstoque || !n || n <= 0) return;
    setBusy(true);
    await baixaStock(emEstoque.id, n);
    setBusy(false);
    showToast(`${item!.name}: baixa de ${n} ${emEstoque.unit}`);
    fechar();
  }

  const btn = "h-[50px] w-full rounded-[14px] text-[15px] font-bold disabled:opacity-50";

  return (
    <Modal open={!!item} onClose={fechar} maxWidth={420}>
      <div className="mb-1 text-[19px] font-extrabold">{item.name}</div>
      <div className="mb-4 text-[13px] text-text-2">
        {emEstoque
          ? `Você tem ${emEstoque.current} ${emEstoque.unit} em casa.`
          : "Item da lista de compras."}
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={comprar}
          disabled={busy}
          className={`${btn} bg-brand text-brand-ink`}
        >
          Comprei (repõe o estoque)
        </button>

        {emEstoque &&
          (parcial ? (
            <div className="flex gap-3">
              <input
                value={qtd}
                onChange={(e) => setQtd(e.target.value)}
                inputMode="decimal"
                autoFocus
                placeholder={`Quanto consumiu? (${emEstoque.unit})`}
                className="h-[50px] flex-1 rounded-[14px] border border-border bg-card-2 px-3.5 text-[15px]"
              />
              <button
                onClick={baixaParcial}
                disabled={busy || !Number(qtd.replace(",", "."))}
                className="h-[50px] rounded-[14px] bg-warn px-5 text-[15px] font-bold text-white disabled:opacity-50"
              >
                Baixar
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setParcial(true)}
                disabled={busy}
                className={`${btn} border border-warn bg-card text-warn`}
              >
                Baixa parcial
              </button>
              <button
                onClick={baixaTotal}
                disabled={busy}
                className={`${btn} border border-warn bg-warn text-white`}
              >
                Baixa total
              </button>
            </div>
          ))}

        <button
          onClick={remover}
          disabled={busy}
          className={`${btn} border border-neg bg-card text-neg`}
        >
          Tirar da lista
        </button>
        <button
          onClick={fechar}
          className={`${btn} border border-border bg-card`}
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
