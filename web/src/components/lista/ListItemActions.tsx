"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { useStore } from "@/lib/store";
import type { ShopItem } from "@/lib/types";
import { brl } from "@/lib/format";
import { casaItem, maisBarato, nomeCompleto, porUnidade, prazo, type Oferta } from "@/lib/ofertas";
import { useListaOfertas } from "@/components/ofertas/useOfertas";
import { Foto, Selo } from "@/components/ofertas/pecas";

const UNITS = ["un", "kg", "g", "L", "ml", "pct", "cx", "dz"];
const field =
  "h-12 w-full rounded-[13px] border border-border bg-card-2 px-3.5 text-[15px]";
const labelCls = "mb-1.5 block text-xs font-bold text-text-2";

// Ao tocar num item da lista: primeiro ONDE ele esta mais barato esta semana (um
// mercado por linha, o menor em cima; tocar usa aquele preco), depois quanto quer
// e por quanto, e so duas acoes: Comprei e Tirar. Baixa de estoque saiu daqui: mora
// no Estoque (-1/+1 no card), e oito botoes num popup ninguem le no corredor.
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
  const { stock, updateShopItem, showToast } = useStore();
  const ofertas = useListaOfertas();
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
  const btn = "h-[50px] w-full rounded-[14px] text-[15px] font-bold disabled:opacity-50";
  // Um por mercado: a oferta mais barata de cada um, o menor em cima.
  const porMercado = [
    ...new Map(
      ofertas
        .filter((o) => casaItem(o, item.name))
        .sort(maisBarato)
        .reverse()
        .map((o) => [o.mercado, o] as [string, Oferta]),
    ).values(),
  ].sort(maisBarato);
  const precoAtual = preco === "" ? null : Number(preco.replace(",", ".")) || null;
  const totalPrevisto =
    (Number(qtd.replace(",", ".")) || 0) *
    (preco === "" ? 0 : Number(preco.replace(",", ".")) || 0);

  return (
    <Modal open={!!item} onClose={onClose} maxWidth={420}>
      <div className="mb-1 pr-12 text-[20px] font-extrabold capitalize">{item.name}</div>
      <div className="mb-4 text-[13px] text-text-2">
        {emEstoque ? `🏠 Em casa: ${emEstoque.current} ${emEstoque.unit}` : "🏠 Não tem em casa"}
      </div>

      {porMercado.length > 0 ? (
        <div className="mb-4">
          <div className="mb-1.5 text-xs font-bold text-text-2">Onde está mais barato esta semana</div>
          <div className="flex flex-col gap-1.5">
            {porMercado.slice(0, 5).map((o, i) => {
              const u = porUnidade(o);
              const p = prazo(o);
              const usado = precoAtual === o.preco_por;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPreco(String(o.preco_por))}
                  className={`flex items-center gap-2.5 rounded-[14px] border p-2 text-left ${
                    i === 0 ? "border-pos bg-pos-soft" : "border-border bg-card"
                  } ${usado ? "ring-2 ring-brand" : ""}`}
                >
                  <Foto o={o} className="h-11 w-11 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Selo mercado={o.mercado} />
                      {i === 0 && (
                        <span className="text-[11px] font-extrabold text-pos">
                          {/* o primeiro ganha no preco por kg/L; se outro tem etiqueta menor, diz o porque */}
                          {u && porMercado.some((x) => x.preco_por < o.preco_por) ? `MAIS BARATO POR ${u.u.toUpperCase()}` : "MAIS BARATO"}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-text-2">{nomeCompleto(o)}</div>
                    <div className="text-[11px] text-text-3">{p?.texto ?? "Preço de hoje"}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[17px] font-extrabold tabular-nums ${i === 0 ? "text-pos" : ""}`}>{brl(o.preco_por)}</div>
                    {u && <div className="text-[11px] text-text-2">{brl(u.valor)}/{u.u}</div>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 text-[11px] text-text-3">Toque num mercado para usar o preço dele.</div>
        </div>
      ) : (
        <div className="mb-4 rounded-[13px] bg-card-2 px-3 py-2 text-[13px] text-text-2">Sem oferta desse item esta semana.</div>
      )}

      {/* Editar quanto quer comprar e o preco pesquisado.
          Form so aqui: os botoes de acao abaixo ficam de fora de proposito,
          para Enter no campo de preco salvar a edicao e nao comprar o item. */}
      <form onSubmit={(e) => { e.preventDefault(); salvar(); }}>
      <div className="mb-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <label className={labelCls}>Quantidade</label>
          <QtyStepper value={qtd} onChange={setQtd} unit={unidade} />
        </div>
        <div className="w-[84px] shrink-0">
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
        className={`${btn} mb-3 border border-brand bg-card text-brand`}
      >
        Salvar quantidade e preço
      </button>
      </form>

      <div data-rodape className="flex gap-3">
        <button onClick={comprar} disabled={busy} className={`${btn} flex-[1.4] bg-pos text-white`}>
          ✓ Comprei
        </button>
        <button onClick={remover} disabled={busy} className={`${btn} flex-1 border border-neg bg-card text-neg`}>
          Tirar da lista
        </button>
      </div>
    </Modal>
  );
}
