"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { brl, pct, stockRatio } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { StockItem } from "@/lib/types";

export function ItemDetailModal({
  item,
  onClose,
}: {
  item: StockItem | null;
  onClose: () => void;
}) {
  const { addStockToList, addStock, zerarStock, baixaStock, showToast } = useStore();
  const [parcial, setParcial] = useState(false);
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);

  function fechar() {
    setParcial(false);
    setQtd("");
    onClose();
  }
  if (!item) return null;

  const ratio = stockRatio(item.current, item.normal);
  const repor = ratio < 0.5;
  const barColor = repor ? "var(--warn)" : "var(--pos)";
  const trendUp = item.trend > 0;
  const trendLabel = `${trendUp ? "+" : ""}${Math.round(item.trend * 100)}%`;

  // ponytail: historico sintetico ate existir log real de eventos.
  const history = [
    { date: "hoje", text: `Em casa: ${item.current} ${item.unit}` },
    { date: "compra", text: "Último preço pago", price: brl(item.priceLast ?? 0) },
    { date: "média", text: "Preço médio (3 meses)", price: brl(item.priceAvg ?? 0) },
  ];

  async function add() {
    await addStockToList(item!);
    showToast(`${item!.name} adicionado à lista`);
    fechar();
  }

  async function baixaTotal() {
    setBusy(true);
    await zerarStock([item!.id]);
    setBusy(false);
    showToast(`${item!.name}: baixa total`);
    fechar();
  }

  async function baixaParcial() {
    const n = Number(qtd.replace(",", "."));
    if (!n || n <= 0) return;
    setBusy(true);
    await baixaStock(item!.id, n);
    setBusy(false);
    showToast(`${item!.name}: baixa de ${n} ${item!.unit}`);
    fechar();
  }

  // Repor: volta o item ao nivel normal (soma no estoque, sem virar compra).
  // Serve pra desfazer baixa acidental sem re-cadastrar o item.
  async function repor_() {
    const falta = Math.max(1, +(item!.normal - item!.current).toFixed(3));
    setBusy(true);
    await addStock({ name: item!.name, qty: falta, unit: item!.unit });
    setBusy(false);
    showToast(`${item!.name} reposto no estoque`);
    fechar();
  }

  return (
    <Modal open={!!item} onClose={fechar}>
      <div className="mb-5 flex items-center gap-3.5">
        <AvatarInitial name={item.name} size={52} />
        <div className="flex-1">
          <div className="text-[20px] font-extrabold">{item.name}</div>
          <div className="text-[13px] text-text-2">{item.category}</div>
        </div>
        <span
          className={`rounded-full px-2.5 py-[5px] text-xs font-bold ${
            repor ? "bg-warn-soft text-warn" : "bg-pos-soft text-pos"
          }`}
        >
          {repor ? "Repor" : "Em casa"}
        </span>
      </div>

      <div className="mb-3.5 rounded-[16px] bg-card-2 p-4">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-text-3">
            Nível em casa
          </span>
          <span className="text-[13px] font-bold text-text-2">{pct(ratio * 100)}</span>
        </div>
        <div className="mb-2 h-3 overflow-hidden rounded-[7px] bg-card">
          <div
            className="h-full rounded-[7px]"
            style={{
              width: `${Math.max(4, Math.min(100, ratio * 100))}%`,
              background: barColor,
            }}
          />
        </div>
        <div className="flex justify-between text-[13px] text-text-2">
          <span>
            Tem {item.current} {item.unit}
          </span>
          <span>
            Normal {item.normal} {item.unit}
          </span>
        </div>
      </div>

      <div className="mb-3.5 flex gap-3">
        <div className="flex-1 rounded-[16px] bg-card-2 p-3.5">
          <div className="mb-1.5 text-xs text-text-3">Último preço</div>
          <div className="text-[20px] font-extrabold">{brl(item.priceLast ?? 0)}</div>
        </div>
        <div className="flex-1 rounded-[16px] bg-card-2 p-3.5">
          <div className="mb-1.5 text-xs text-text-3">Preço médio</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-extrabold">{brl(item.priceAvg ?? 0)}</span>
            <span
              className={`text-[13px] font-bold ${trendUp ? "text-neg" : "text-pos"}`}
            >
              {trendLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-2 mt-[18px] text-xs font-bold uppercase tracking-wide text-text-3">
        Histórico
      </div>
      <div className="mb-5">
        {history.map((h) => (
          <div
            key={h.date}
            className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
          >
            <span className="w-[64px] shrink-0 text-xs font-bold text-text-3">
              {h.date}
            </span>
            <span className="flex-1 text-[14px]">{h.text}</span>
            {"price" in h && (
              <span className="text-[13px] font-bold text-text-2">{h.price}</span>
            )}
          </div>
        ))}
      </div>

      {/* Repor: volta ao nivel normal. Aparece quando falta estoque (ex.: baixa
          acidental). Nao vira compra, so recompoe o que ja existe no cadastro. */}
      {item.current < item.normal && (
        <>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-3">
            Repor no estoque
          </div>
          <button
            onClick={repor_}
            disabled={busy}
            className="mb-3.5 h-[50px] w-full rounded-[14px] bg-pos text-[15px] font-bold text-white disabled:opacity-50"
          >
            Repor ao normal ({item.normal} {item.unit})
          </button>
        </>
      )}

      {/* Baixa por consumo: total zera; parcial subtrai a quantidade consumida */}
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-3">
        Dar baixa por consumo
      </div>
      {parcial ? (
        <div className="mb-3.5 flex gap-3">
          <input
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            inputMode="decimal"
            autoFocus
            placeholder={`Quanto consumiu? (${item.unit})`}
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
        <div className="mb-3.5 flex gap-3">
          <button
            onClick={() => setParcial(true)}
            disabled={busy}
            className="h-[50px] flex-1 rounded-[14px] border border-warn bg-card text-[15px] font-bold text-warn disabled:opacity-50"
          >
            Baixa parcial
          </button>
          <button
            onClick={baixaTotal}
            disabled={busy}
            className="h-[50px] flex-1 rounded-[14px] border border-warn bg-warn text-[15px] font-bold text-white disabled:opacity-50"
          >
            Baixa total
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={fechar}
          className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold"
        >
          Fechar
        </button>
        <button
          onClick={add}
          className="h-[50px] flex-[1.4] rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink"
        >
          Adicionar à lista
        </button>
      </div>
    </Modal>
  );
}
