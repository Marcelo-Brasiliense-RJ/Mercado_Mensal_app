"use client";

import { useState } from "react";
import type { StockItem } from "@/lib/types";
import { stockRatio, brl } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import {
  SearchIcon,
  ChevronRight,
  CheckIcon,
  ReceiptIcon,
  TelegramIcon,
  PlusIcon,
} from "@/components/ui/icons";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useStore, type RpcResult } from "@/lib/store";
import { BOT_URL } from "@/lib/config";
import { AddMenu } from "@/components/ui/AddMenu";
import { VoiceModal } from "@/components/voz/VoiceModal";
import { ItemDetailModal } from "./ItemDetailModal";
import { BatchAddModal } from "./BatchAddModal";

export function StockView() {
  const { stock, zerarStock, deleteStock, stockToList, showToast, openReceipt } =
    useStore();
  const [q, setQ] = useState("");
  // Guarda o id, nao o objeto: depois de salvar o nivel normal o modal precisa
  // mostrar o valor novo, e um StockItem congelado no state mostraria o antigo.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selMode, setSelMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [stockAddOpen, setStockAddOpen] = useState(false);

  const filtered = stock.filter((i) =>
    i.name.toLowerCase().includes(q.toLowerCase()),
  );
  const repor = filtered.filter((i) => stockRatio(i.current, i.normal) < 0.5);
  const ok = filtered.filter((i) => stockRatio(i.current, i.normal) >= 0.5);
  const valorTotal = stock.reduce((a, i) => a + i.current * (i.priceLast ?? 0), 0);
  const detail = stock.find((i) => i.id === detailId) ?? null;

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
  function selecionarTudo() {
    setSelected(new Set(filtered.map((i) => i.id)));
  }
  function onItem(item: StockItem) {
    if (selMode) toggleSel(item.id);
    else setDetailId(item.id);
  }

  async function runBatch(
    fn: (ids: string[]) => Promise<RpcResult>,
    msg: (n: number) => string,
    confirmMsg?: string,
  ) {
    if (!selected.size) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    const n = selected.size;
    setBusy(true);
    const r = await fn([...selected]);
    setBusy(false);
    if (!r.ok) return showToast(r.erro);
    showToast(msg(n));
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

  const headerAction = (
    <div className="flex items-center gap-2">
      {search}
      <button
        onClick={() => setAddMenuOpen(true)}
        aria-label="Adicionar item"
        className="hidden h-[44px] shrink-0 items-center gap-2 rounded-[12px] bg-brand px-[18px] text-[14px] font-bold text-brand-ink lg:flex"
      >
        <PlusIcon size={18} />
        Adicionar
      </button>
    </div>
  );

  return (
    <>
      <ScreenHeader
        title="Estoque"
        subtitle={`${stock.length} itens · ${brl(valorTotal)} em estoque`}
        action={headerAction}
      />

      <div className="space-y-6 pb-24">
        <div className="lg:hidden">{search}</div>

        {stock.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-text-3">
              {selMode
                ? `${selected.size} selecionado(s)`
                : "Toque em Selecionar para agir em lote"}
            </span>
            <div className="flex gap-2">
              {selMode && (
                <button
                  onClick={selecionarTudo}
                  className="h-9 rounded-[10px] border border-border bg-card px-3.5 text-[13px] font-bold text-text-2"
                >
                  Selecionar tudo
                </button>
              )}
              <button
                onClick={() => (selMode ? exitSel() : setSelMode(true))}
                className="h-9 rounded-[10px] border border-border bg-card px-3.5 text-[13px] font-bold text-text-2"
              >
                {selMode ? "Cancelar" : "Selecionar"}
              </button>
            </div>
          </div>
        )}

        {stock.length === 0 && (
          <div className="pt-8">
            <div className="mb-1 text-center text-[18px] font-extrabold">
              Sua despensa está vazia
            </div>
            <p className="mx-auto mb-5 max-w-[420px] text-center text-[14px] leading-relaxed text-text-2">
              Registre sua primeira compra e o estoque aparece aqui. Escolha como:
            </p>
            <div className="mx-auto flex max-w-[440px] flex-col gap-3">
              <button
                onClick={openReceipt}
                className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-brand bg-card p-4 text-left"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand text-brand-ink">
                  <ReceiptIcon size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold">Foto da nota fiscal</span>
                  <span className="block text-[13px] leading-snug text-text-2">
                    A gente lê os itens e preços automaticamente.
                  </span>
                </span>
                <ChevronRight size={20} className="shrink-0 text-text-3" />
              </button>
              <a
                href={BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-[#2AABEE] bg-card p-4"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#2AABEE] text-white">
                  <TelegramIcon size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold">Áudio no Telegram</span>
                  <span className="block text-[13px] leading-snug text-text-2">
                    Fale o que comprou que o bot registra pra você.
                  </span>
                </span>
                <ChevronRight size={20} className="shrink-0 text-[#2AABEE]" />
              </a>
            </div>
          </div>
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
        <div className="fixed inset-x-0 bottom-[76px] z-40 mx-auto flex max-w-[640px] flex-wrap gap-2 px-4 lg:bottom-6 lg:max-w-[1120px] lg:px-9">
          <button
            onClick={() => runBatch(zerarStock, (n) => `${n} item(ns) zerado(s)`)}
            disabled={busy}
            className="h-[50px] min-w-[100px] flex-1 rounded-[14px] bg-brand text-[14px] font-bold text-brand-ink shadow-[0_8px_24px_var(--shadow-lg)] disabled:opacity-50"
          >
            Dar baixa ({selected.size})
          </button>
          <button
            onClick={() => runBatch(stockToList, (n) => `${n} item(ns) na lista de compras`)}
            disabled={busy}
            className="h-[50px] min-w-[100px] flex-1 rounded-[14px] border border-brand bg-card text-[14px] font-bold text-brand shadow-[0_8px_24px_var(--shadow-lg)] disabled:opacity-50"
          >
            + Lista ({selected.size})
          </button>
          <button
            onClick={() =>
              runBatch(
                deleteStock,
                (n) => `${n} item(ns) excluído(s)`,
                `Excluir ${selected.size} item(ns) do estoque?`,
              )
            }
            disabled={busy}
            className="h-[50px] min-w-[100px] flex-1 rounded-[14px] border border-neg bg-card text-[14px] font-bold text-neg shadow-[0_8px_24px_var(--shadow-lg)] disabled:opacity-50"
          >
            Excluir ({selected.size})
          </button>
        </div>
      )}

      {/* FAB "+" (mobile): esconde no modo selecao pra nao brigar com a barra de lote */}
      {!selMode && (
        <button
          onClick={() => setAddMenuOpen(true)}
          aria-label="Adicionar item"
          className="fixed bottom-[92px] right-4 z-30 grid h-14 w-14 place-items-center rounded-[18px] bg-brand text-brand-ink shadow-[0_10px_24px_var(--shadow-lg)] lg:hidden"
        >
          <PlusIcon />
        </button>
      )}

      <AddMenu
        open={addMenuOpen}
        onClose={() => setAddMenuOpen(false)}
        onManual={() => setStockAddOpen(true)}
        onVoice={() => setVoiceOpen(true)}
        title="Adicionar ao estoque"
        manualLabel="Digitar os itens"
        manualDesc="Vários de uma vez, numa lista só."
      />
      <BatchAddModal open={stockAddOpen} onClose={() => setStockAddOpen(false)} />
      <VoiceModal open={voiceOpen} onClose={() => setVoiceOpen(false)} />

      <ItemDetailModal item={detail} onClose={() => setDetailId(null)} />
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
  // Sem par_level definido stockRatio devolve 1: a barra encheria e o card diria
  // 100% para um item sobre o qual nao sabemos nada. Melhor nao dizer.
  const semReferencia = item.normal <= 0;
  const repor = !semReferencia && ratio < 0.5;
  const valor = item.priceLast ? item.current * item.priceLast : null;
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
              {valor !== null ? ` · ${brl(valor)}` : ""}
            </span>
          </div>
          {!semReferencia && (
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar ratio={ratio} />
              <span className="w-9 shrink-0 text-right text-[11px] text-text-3">
                {Math.round(ratio * 100)}%
              </span>
            </div>
          )}
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
              {valor !== null ? ` · ${brl(valor)}` : ""}
            </div>
          </div>
          {repor && (
            <span className="rounded-full bg-warn-soft px-2.5 py-[3px] text-[11px] font-extrabold text-warn">
              Repor
            </span>
          )}
          {!repor && !semReferencia && (
            <span className="text-[12px] font-bold text-text-3">
              {Math.round(ratio * 100)}%
            </span>
          )}
        </div>
        {semReferencia ? (
          <div className="text-[11px] text-text-3">
            Sem referência de quanto ter em casa
          </div>
        ) : (
          <>
            <ProgressBar ratio={ratio} height={8} />
            <div className="mt-[7px] flex justify-between text-[11px] text-text-3">
              <span>Nível</span>
              <span>
                costuma ter {item.normal} {item.unit}
              </span>
            </div>
          </>
        )}
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
