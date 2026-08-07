"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { useStore } from "@/lib/store";
import type { ShopItem } from "@/lib/types";

const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];
const field =
  "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const labelCls = "mb-1.5 block text-xs font-bold text-text-2";

// Acoes ao clicar num item da lista: editar quantidade/unidade/preco (controle
// de quanto quer comprar e o preco pesquisado), comprar (repoe estoque), baixa
// por consumo (so quando ja tem em estoque) e tirar da lista.
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
  const { stock, updateShopItem, zerarStock, baixaStock, showToast } = useStore();
  const [parcial, setParcial] = useState(false);
  const [qBaixa, setQBaixa] = useState("");
  const [busy, setBusy] = useState(false);
  // Campos de edicao, pre-preenchidos com o item atual (o parent remonta por key).
  const [qtd, setQtd] = useState(item ? String(item.desired_quantity) : "1");
  const [unidade, setUnidade] = useState(item?.unit ?? "un");
  const [preco, setPreco] = useState(
    item?.estimated_price != null ? String(item.estimated_price) : "",
  );

  if (!item) return null;

  const emEstoque = stock.find(
    (s) => s.name.toLowerCase() === item.name.toLowerCase(),
  );

  async function salvar() {
    setBusy(true);
    const r = await updateShopItem(item!.id, {
      qty: Number(qtd.replace(",", ".")) || 0,
      unit: unidade,
      price: preco === "" ? null : Number(preco.replace(",", ".")) || 0,
    });
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name} atualizado`);
    onClose();
  }
  async function comprar() {
    setBusy(true);
    await onComprar(item!.id);
    setBusy(false);
    onClose();
  }
  async function remover() {
    setBusy(true);
    await onRemover(item!.id);
    setBusy(false);
    onClose();
  }
  async function baixaTotal() {
    if (!emEstoque) return;
    setBusy(true);
    const r = await zerarStock([emEstoque.id]);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name}: baixa total`);
    onClose();
  }
  async function baixaParcial() {
    const n = Number(qBaixa.replace(",", "."));
    if (!emEstoque || !n || n <= 0) return;
    setBusy(true);
    const r = await baixaStock(emEstoque.id, n);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(`${item!.name}: baixa de ${n} ${emEstoque.unit}`);
    onClose();
  }

  const btn = "h-[50px] w-full rounded-[14px] text-[15px] font-bold disabled:opacity-50";
  const totalPrevisto =
    (Number(qtd.replace(",", ".")) || 0) *
    (preco === "" ? 0 : Number(preco.replace(",", ".")) || 0);

  return (
    <Modal open={!!item} onClose={onClose} maxWidth={420}>
      <div className="mb-1 text-[19px] font-extrabold">{item.name}</div>
      <div className="mb-4 text-[13px] text-text-2">
        {emEstoque
          ? `Você tem ${emEstoque.current} ${emEstoque.unit} em casa.`
          : "Item da lista de compras."}
      </div>

      {/* Editar quanto quer comprar e o preco pesquisado.
          Form so aqui: os botoes de acao abaixo ficam de fora de proposito,
          para Enter no campo de preco salvar a edicao e nao comprar o item. */}
      <form onSubmit={(e) => { e.preventDefault(); salvar(); }}>
      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className={labelCls}>Quantidade</label>
          <QtyStepper value={qtd} onChange={setQtd} unit={unidade} />
        </div>
        <div className="w-[104px]">
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
      <label className={labelCls}>Preço estimado (unidade)</label>
      <input
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        inputMode="decimal"
        placeholder="R$ 0,00"
        className={`${field} mb-2`}
      />
      {totalPrevisto > 0 && (
        <div className="mb-3 text-[12px] text-text-3">
          Total previsto: R$ {totalPrevisto.toFixed(2).replace(".", ",")}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className={`${btn} mb-4 bg-brand text-brand-ink`}
      >
        Salvar alterações
      </button>
      </form>

      <div className="mb-2 border-t border-border" />

      <div className="flex flex-col gap-3">
        <button
          onClick={comprar}
          disabled={busy}
          className={`${btn} border border-brand bg-card text-brand`}
        >
          Comprei (repõe o estoque)
        </button>

        {emEstoque &&
          (parcial ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <QtyStepper
                  value={qBaixa}
                  onChange={setQBaixa}
                  unit={emEstoque.unit}
                  autoFocus
                  placeholder={emEstoque.unit}
                />
              </div>
              <button
                type="button"
                onClick={baixaParcial}
                disabled={busy || !Number(qBaixa.replace(",", "."))}
                className="h-12 shrink-0 rounded-[13px] bg-warn px-5 text-[15px] font-bold text-white disabled:opacity-50"
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
          onClick={onClose}
          className={`${btn} border border-border bg-card`}
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
