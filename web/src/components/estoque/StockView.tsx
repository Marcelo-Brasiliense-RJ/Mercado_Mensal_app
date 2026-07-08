"use client";

import { useState } from "react";
import type { StockItem } from "@/lib/types";
import { stockRatio } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { SearchIcon, ChevronRight, CheckIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore } from "@/lib/store";
import { ItemDetailModal } from "./ItemDetailModal";

export function StockView() {
  const { stock, zerarStock, deleteStock, showToast } = useStore();
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<StockItem | null>(null);
  const [selMode, setSelMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const filtered = stock.filter((i) =>
    i.name.toLowerCase().includes(q.toLowerCase()),
  );
  const repor = filtered.filter((i) => stockRatio(i.current, i.normal) < 0.5);
  const ok = filtered.filter((i) => stockRatio(i.current, i.normal) >= 0.5);

  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function exitSel() {
    setSelMode(false);
    setSelected(new Set());
  }
  function onItem(item: StockItem) {
    if (selMode) toggleSel(item.id);
    else setDetail(item);
  }

  async function darBaixa() {
    if (!selected.size) return;
    setBusy(true);
    await zerarStock([...selected]);
    setBusy(false);
    showToast(`${selected.size} item(ns) zerado(s)`);
    exitSel();
  }
  async function excluir() {
    if (!selected.size) return;
    if (!confirm(`Excluir ${selected.size} item(ns) do estoque?`)) return;
    setBusy(true);
    await deleteStock([...selected]);
    setBusy(false);
    showToast(`${selected.size} item(ns) excluído(s)`);
    exitSel();
  }

  const search = (
    <div className="relative w-full lg:w-[280px]">
      <SearchIcon
        size={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar item..."
        className="h-[44px] w-full rounded-[12px] border border-border bg-card pl-[42px] pr-4 text-[14px] lg:h-[44px]"
      />
    </div>
  );

  return (
    <>
      <ScreenHeader
        title="Estoque"
        subtitle={`${stock.length} itens na dispensa`}
        action={search}
      />

      <div className="space-y-6 pb-24">
        <div className="lg:hidden">{search}</div>

        {stock.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-3">
              {selMode ? `${selected.size} selecionado(s)` : "Toque em Selecionar para dar baixa ou excluir"}
            </span>
            <button
              onClick={() => (selMode ? exitSel() : setSelMode(true))}
              className="h-9 rounded-[10px] border border-border bg-card px-3.5 text-[13px] font-bold text-text-2"
            >
              {selMode ? "Cancelar" : "Selecionar"}
            </button>
          </div>
        )}

        {stock.length === 0 && (
          <p className="pt-12 text-center text-[15px] leading-relaxed text-text-3">
            Sua dispensa está vazia. Registre suas compras por áudio no bot do
            Telegram e o estoque aparece aqui.
          </p>
        )}

        {repor.length > 0 && (
          <Section label="Repor" count={repor.length} warn>
            {repor.map((i) => (
              <Item
                key={i.id}
                item={i}
                selMode={selMode}
                selected={selected.has(i.id)}
                onClick={() => onItem(i)}
              />
            ))}
          </Section>
        )}
        {ok.length > 0 && (
          <Section label="Tudo em casa" count={ok.length}>
            {ok.map((i) => (
              <Item
                key={i.id}
                item={i}
                selMode={selMode}
                selected={selected.has(i.id)}
                onClick={() => onItem(i)}
              />
            ))}
          </Section>
        )}
        {stock.length > 0 && filtered.length === 0 && (
          <p className="pt-10 text-center text-text-3">Nenhum item encontrado.</p>
        )}
      </div>

      {/* Barra de acoes em lote */}
      {selMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[76px] z-40 mx-auto flex max-w-[640px] gap-3 px-4 lg:bottom-6 lg:max-w-[1120px] lg:px-9">
          <button
            onClick={darBaixa}
            disabled={busy}
            className="h-[52px] flex-1 rounded-[14px] bg-brand text-[15px] font-bold text-brand-ink shadow-[0_8px_24px_var(--shadow-lg)] disabled:opacity-50"
          >
            Dar baixa ({selected.size})
          </button>
          <button
            onClick={excluir}
            disabled={busy}
            className="h-[52px] flex-1 rounded-[14px] border border-neg bg-card text-[15px] font-bold text-neg shadow-[0_8px_24px_var(--shadow-lg)] disabled:opacity-50"
          >
            Excluir ({selected.size})
          </button>
        </div>
      )}

      <ItemDetailModal item={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function Section({
  label,
  count,
  warn = false,
  children,
}: {
  label: string;
  count: number;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span
          className={`text-[13px] font-extrabold uppercase tracking-wide ${
            warn ? "text-warn" : "text-text-3"
          }`}
        >
          {label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            warn ? "bg-warn-soft text-warn" : "bg-card-2 text-text-3"
          }`}
        >
          {count}
        </span>
      </div>
      <div className="space-y-2.5 lg:grid lg:grid-cols-3 lg:gap-3.5 lg:space-y-0">
        {children}
      </div>
    </section>
  );
}

function Item({
  item,
  selMode,
  selected,
  onClick,
}: {
  item: StockItem;
  selMode: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const ratio = stockRatio(item.current, item.normal);
  const repor = ratio < 0.5;
  return (
    <>
      {/* Mobile */}
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-[16px] border bg-card p-3 text-left shadow-[0_1px_3px_var(--shadow)] lg:hidden ${
          selected ? "border-brand ring-1 ring-brand" : "border-border"
        } ${repor && !selected ? "border-l-[3px] border-l-warn" : ""}`}
      >
        {selMode && <SelDot on={selected} />}
        <AvatarInitial name={item.name} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-bold">{item.name}</span>
            <span className="shrink-0 text-sm text-text-2">
              {item.current} {item.unit}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar ratio={ratio} />
            <span className="w-9 shrink-0 text-right text-[11px] text-text-3">
              {Math.round(ratio * 100)}%
            </span>
          </div>
        </div>
        {!selMode && !repor && (
          <ChevronRight size={18} className="shrink-0 text-text-3" />
        )}
      </button>

      {/* Desktop */}
      <button
        onClick={onClick}
        className={`hidden text-left lg:block rounded-[18px] border bg-card p-4 shadow-[0_1px_3px_var(--shadow)] ${
          selected ? "border-brand ring-1 ring-brand" : "border-border"
        } ${repor && !selected ? "border-l-[3px] border-l-warn" : ""}`}
      >
        <div className="mb-3.5 flex items-center gap-3">
          {selMode && <SelDot on={selected} />}
          <AvatarInitial name={item.name} size={42} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">{item.name}</div>
            <div className="text-[13px] text-text-2">
              {item.current} {item.unit}
            </div>
          </div>
          {repor ? (
            <span className="rounded-full bg-warn-soft px-2.5 py-[3px] text-[11px] font-extrabold text-warn">
              Repor
            </span>
          ) : (
            <span className="text-[12px] font-bold text-text-3">
              {Math.round(ratio * 100)}%
            </span>
          )}
        </div>
        <ProgressBar ratio={ratio} height={8} />
        <div className="mt-[7px] flex justify-between text-[11px] text-text-3">
          <span>Nível</span>
          <span>
            normal {item.normal} {item.unit}
          </span>
        </div>
      </button>
    </>
  );
}

function SelDot({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 ${
        on ? "border-brand bg-brand text-brand-ink" : "border-border text-transparent"
      }`}
    >
      <CheckIcon size={12} />
    </span>
  );
}
