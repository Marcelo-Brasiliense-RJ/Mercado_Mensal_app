"use client";

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
  const { addStockToList, showToast } = useStore();
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
    onClose();
  }

  return (
    <Modal open={!!item} onClose={onClose}>
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

      <div className="flex gap-3">
        <button
          onClick={onClose}
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
